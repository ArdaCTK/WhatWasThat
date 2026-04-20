use crate::app_info;
use crate::cache::get_cache;
use crate::crypto;
use crate::database::Database;
use crate::masking;
use crate::models::*;
use crate::queue::process_one;
use crate::undo::UndoStack;
use base64::Engine;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Manager;
use tauri::State;
use tokio::sync::Mutex;

#[cfg(target_os = "windows")]
fn is_windows_dev_binary(path: &Path) -> bool {
    let lower = path.to_string_lossy().replace('/', "\\").to_ascii_lowercase();
    lower.contains("\\target\\debug\\") || lower.contains("\\target\\debug.exe")
}

#[cfg(target_os = "windows")]
fn find_windows_release_binary(current_exe: &Path) -> Option<PathBuf> {
    let file_name = current_exe.file_name()?;
    for ancestor in current_exe.ancestors() {
        if let Some(name) = ancestor.file_name().and_then(|n| n.to_str()) {
            if name.eq_ignore_ascii_case("debug") {
                let candidate = ancestor.parent()?.join("release").join(file_name);
                if candidate.exists() { return Some(candidate); }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn resolve_windows_startup_command() -> Result<String, String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let startup_exe = if is_windows_dev_binary(&current_exe) {
        find_windows_release_binary(&current_exe).ok_or_else(|| {
            "Launch at startup requires a production build. Build the release app once, then enable this setting again.".to_string()
        })?
    } else {
        current_exe
    };
    Ok(format!("\"{}\"", startup_exe.to_string_lossy()))
}

#[cfg(target_os = "windows")]
pub(crate) fn set_windows_startup(enable: bool) -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu
        .open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", KEY_SET_VALUE)
        .map_err(|e| e.to_string())?;
    if enable {
        run_key.set_value("WhatWasThat", &resolve_windows_startup_command()?).map_err(|e| e.to_string())?;
    } else {
        let _ = run_key.delete_value("WhatWasThat");
    }
    Ok(())
}

pub struct AppState {
    pub db: Arc<Database>,
    pub images_dir: std::path::PathBuf,
    pub undo_stack: Arc<Mutex<UndoStack>>,
    pub archive_cancel: Arc<AtomicBool>,
}

type Db = Arc<Mutex<AppState>>;

#[tauri::command]
pub async fn get_screenshots(state: State<'_, Db>, query: SearchQuery) -> Result<Vec<Screenshot>, String> {
    state.lock().await.db.search_screenshots(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_screenshot(state: State<'_, Db>, id: String) -> Result<Option<Screenshot>, String> {
    state.lock().await.db.get_screenshot(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_screenshot(state: State<'_, Db>, id: String) -> Result<(), String> {
    let s = state.lock().await;
    if let Ok(Some(ss)) = s.db.get_screenshot(&id) {
        let _ = std::fs::remove_file(&ss.image_path);
        get_cache().remove(&id);
    }
    s.db.delete_screenshot(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_screenshot_with_undo(state: State<'_, Db>, id: String) -> Result<Option<String>, String> {
    let s = state.lock().await;
    let ss = s.db.get_screenshot(&id).map_err(|e| e.to_string())?.ok_or_else(|| "Not found".to_string())?;
    let title = ss.title.clone();
    s.undo_stack.lock().await.push(ss);
    s.db.delete_screenshot(&id).map_err(|e| e.to_string())?;
    get_cache().remove(&id);
    Ok(title)
}

#[tauri::command]
pub async fn undo_delete(state: State<'_, Db>) -> Result<Option<Screenshot>, String> {
    let s = state.lock().await;
    let restored = s.undo_stack.lock().await.pop();
    if let Some(ref ss) = restored {
        if std::path::Path::new(&ss.image_path).exists() {
            s.db.insert_screenshot(ss).map_err(|e| e.to_string())?;
            return Ok(restored);
        } else {
            return Err("Image file no longer exists on disk".into());
        }
    }
    Ok(None)
}

#[tauri::command]
pub async fn peek_undo(state: State<'_, Db>) -> Result<Option<String>, String> {
    Ok(state.lock().await.undo_stack.lock().await.peek().and_then(|s| s.title.clone()))
}

#[tauri::command]
pub async fn update_screenshot(state: State<'_, Db>, screenshot: Screenshot) -> Result<(), String> {
    let s = state.lock().await;
    if let Ok(Some(old)) = s.db.get_screenshot(&screenshot.id) {
        if old.category != screenshot.category || old.tags != screenshot.tags {
            let _ = s.db.save_correction(&UserCorrection {
                screenshot_id: screenshot.id.clone(),
                old_category: old.category.clone(),
                new_category: screenshot.category.clone().unwrap_or_default(),
                old_tags: old.tags.clone(),
                new_tags: screenshot.tags.clone(),
                corrected_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
            });
        }
    }
    s.db.update_screenshot(&screenshot).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn process_screenshot(state: State<'_, Db>, id: String) -> Result<Screenshot, String> {
    let (settings, db) = { let s = state.lock().await; (s.db.load_settings(), s.db.clone()) };
    let ss = db.get_screenshot(&id).map_err(|e| e.to_string())?.ok_or_else(|| "Not found".to_string())?;
    let mut m = ss.clone();
    m.status = "processing".to_string();
    db.update_screenshot(&m).map_err(|e| e.to_string())?;
    let updated = process_one(ss, &settings, &db).await;
    if let Some(ref t) = updated.image_thumb { get_cache().set(&updated.id, t.clone()); }
    Ok(updated)
}

#[tauri::command]
pub async fn cancel_screenshot_processing(state: State<'_, Db>, id: String) -> Result<Screenshot, String> {
    let db = { state.lock().await.db.clone() };
    let mut ss = db.get_screenshot(&id).map_err(|e| e.to_string())?.ok_or_else(|| "Not found".to_string())?;
    crate::queue::get_queue().cancel(&id).await;
    ss.status = "error".to_string();
    ss.error_msg = Some("Processing cancelled by user".to_string());
    db.update_screenshot(&ss).map_err(|e| e.to_string())?;
    Ok(ss)
}

// FIX: bulk_reprocess now respects queue_concurrency setting.
// Previously ran all screenshots sequentially with a plain for loop.
// Now spawns concurrent tasks limited by a semaphore — same concurrency control
// used by the main processing queue.
#[tauri::command]
pub async fn bulk_reprocess(state: State<'_, Db>, ids: Vec<String>) -> Result<BulkReprocessResult, String> {
    let (settings, db) = { let s = state.lock().await; (s.db.load_settings(), s.db.clone()) };
    let screenshots = db.get_screenshots_by_ids(&ids).map_err(|e| e.to_string())?;
    let count = screenshots.len() as u32;
    let queued_ids: Vec<String> = screenshots.iter().map(|s| s.id.clone()).collect();

    let concurrency = settings.queue_concurrency.max(1);
    let semaphore = Arc::new(tokio::sync::Semaphore::new(concurrency));
    let mut handles = Vec::with_capacity(screenshots.len());

    for ss in screenshots {
        let settings = settings.clone();
        let db = db.clone();
        let sem = semaphore.clone();
        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire().await.unwrap();
            let updated = process_one(ss, &settings, &db).await;
            if let Some(ref t) = updated.image_thumb { get_cache().set(&updated.id, t.clone()); }
            updated
        }));
    }

    for handle in handles {
        let _ = handle.await;
    }

    Ok(BulkReprocessResult { queued: count, ids: queued_ids })
}

#[tauri::command]
pub async fn reprocess_low_confidence(state: State<'_, Db>) -> Result<BulkReprocessResult, String> {
    let (settings, db) = { let s = state.lock().await; (s.db.load_settings(), s.db.clone()) };
    let q = SearchQuery { only_low_confidence: true, limit: 50, ..Default::default() };
    let screenshots = db.search_screenshots(&q).map_err(|e| e.to_string())?;
    let count = screenshots.len() as u32;
    let ids: Vec<String> = screenshots.iter().map(|s| s.id.clone()).collect();
    for ss in screenshots {
        let mut p = ss.clone();
        p.status = "pending".to_string();
        let _ = db.update_screenshot(&p);
        let updated = process_one(p, &settings, &db).await;
        if let Some(ref t) = updated.image_thumb { get_cache().set(&updated.id, t.clone()); }
    }
    Ok(BulkReprocessResult { queued: count, ids })
}

#[tauri::command]
pub async fn reprocess_all_pending(state: State<'_, Db>) -> Result<u32, String> {
    let (settings, db) = { let s = state.lock().await; (s.db.load_settings(), s.db.clone()) };
    let pending = db.get_pending_screenshots().map_err(|e| e.to_string())?;
    let count = pending.len() as u32;
    for ss in pending { process_one(ss, &settings, &db).await; }
    Ok(count)
}

#[tauri::command]
pub async fn get_settings(state: State<'_, Db>) -> Result<AppSettings, String> {
    Ok(state.lock().await.db.load_settings())
}

#[tauri::command]
pub async fn save_settings(state: State<'_, Db>, settings: AppSettings) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    set_windows_startup(settings.run_on_startup)?;
    state.lock().await.db.save_settings(&settings).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_categories(state: State<'_, Db>) -> Result<Vec<Category>, String> {
    state.lock().await.db.get_categories().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_stats(state: State<'_, Db>) -> Result<Stats, String> {
    state.lock().await.db.get_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_image_data(
    state: State<'_, Db>,
    image_path: String,
    screenshot_id: Option<String>,
) -> Result<String, String> {
    if let Some(ref id) = screenshot_id {
        if let Some(cached) = get_cache().get(id) { return Ok(cached); }
    }
    let (settings, images_dir) = {
        let s = state.lock().await;
        (s.db.load_settings(), s.images_dir.clone())
    };
    if settings.archive_locked { return Err("Archive is locked — unlock first".into()); }
    let canonical = std::fs::canonicalize(&image_path).map_err(|e| e.to_string())?;
    let canonical_dir = std::fs::canonicalize(&images_dir).map_err(|e| e.to_string())?;
    if !canonical.starts_with(&canonical_dir) {
        return Err("Access denied".into());
    }
    let bytes = std::fs::read(&canonical).map_err(|e| e.to_string())?;
    let mime = if image_path.ends_with(".png") { "image/png" } else { "image/jpeg" };
    let data = format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(&bytes));
    if let Some(id) = screenshot_id { get_cache().set(&id, data.clone()); }
    Ok(data)
}

#[tauri::command]
pub async fn get_thumbnail_cached(
    state: State<'_, Db>,
    screenshot_id: String,
    image_path: String,
) -> Result<String, String> {
    if let Some(cached) = get_cache().get(&screenshot_id) { return Ok(cached); }
    let images_dir = state.lock().await.images_dir.clone();
    let canonical = std::fs::canonicalize(&image_path).map_err(|e| e.to_string())?;
    let canonical_dir = std::fs::canonicalize(&images_dir).map_err(|e| e.to_string())?;
    if !canonical.starts_with(&canonical_dir) {
        return Err("Access denied".into());
    }
    if let Some(thumb) = crate::ocr::generate_thumbnail(&canonical) {
        get_cache().set(&screenshot_id, thumb.clone());
        return Ok(thumb);
    }
    get_image_data(state, image_path, Some(screenshot_id)).await
}

#[tauri::command]
pub async fn warm_thumbnail_cache(state: State<'_, Db>) -> Result<usize, String> {
    let db = state.lock().await.db.clone();
    let thumbs = db.get_all_thumbnails().map_err(|e| e.to_string())?;
    let count = thumbs.len();
    get_cache().warm_up(thumbs);
    Ok(count)
}

#[tauri::command]
pub async fn get_cache_stats() -> Result<CacheStats, String> {
    let cache = get_cache();
    let queue = crate::queue::get_queue();
    Ok(CacheStats { entries: cache.len(), size_mb: cache.total_size() as f64 / 1_048_576.0, queue_slots: queue.available_slots() })
}

#[tauri::command]
pub async fn clear_thumbnail_cache() -> Result<(), String> {
    get_cache().clear();
    Ok(())
}

#[tauri::command]
pub async fn check_tesseract() -> Result<bool, String> {
    Ok(crate::ocr::is_tesseract_available())
}

#[tauri::command]
pub async fn get_tesseract_path() -> Result<String, String> {
    for c in &["tesseract", r"C:\Program Files\Tesseract-OCR\tesseract.exe", "/usr/local/bin/tesseract", "/opt/homebrew/bin/tesseract"] {
        if let Some(v) = crate::ocr::tesseract_version_line(c) {
            return Ok(format!("{} ({})", c, v));
        }
    }
    Err("Tesseract not found".into())
}

#[tauri::command]
pub async fn open_images_folder(state: State<'_, Db>) -> Result<(), String> {
    let dir = state.lock().await.images_dir.to_string_lossy().to_string();
    #[cfg(target_os = "windows")] std::process::Command::new("explorer").arg(&dir).spawn().ok();
    #[cfg(target_os = "macos")] std::process::Command::new("open").arg(&dir).spawn().ok();
    #[cfg(target_os = "linux")] std::process::Command::new("xdg-open").arg(&dir).spawn().ok();
    Ok(())
}

#[tauri::command]
pub async fn test_llm_connection(state: State<'_, Db>) -> Result<String, String> {
    let settings = state.lock().await.db.load_settings();
    match settings.llm_provider.as_str() {
        "openai" => {
            if settings.openai_api_key.is_empty() { return Err("API key is empty".into()); }
            let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build().map_err(|e| e.to_string())?;
            let resp = client
                .get(format!("{}/models", settings.openai_base_url))
                .header("Authorization", format!("Bearer {}", settings.openai_api_key))
                .send().await.map_err(|e| format!("Connection failed: {}", e))?;
            if resp.status().is_success() {
                Ok(format!("✓ Connected to OpenAI at {}", settings.openai_base_url))
            } else {
                Err(format!("HTTP {}", resp.status()))
            }
        }
        "ollama" => {
            let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).build().map_err(|e| e.to_string())?;
            let resp = client
                .get(format!("{}/api/tags", settings.ollama_url))
                .send().await
                .map_err(|e| format!("Cannot reach Ollama at '{}': {}. Is it running? Try: ollama serve", settings.ollama_url, e))?;
            if resp.status().is_success() {
                Ok(format!("✓ Ollama is running at {}", settings.ollama_url))
            } else {
                Err(format!("Ollama returned HTTP {}", resp.status()))
            }
        }
        _ => Err("LLM provider not selected".into()),
    }
}

#[tauri::command]
pub async fn detect_sensitive_content(text: String) -> Result<Vec<masking::SensitiveMatch>, String> {
    Ok(masking::detect_sensitive(&text))
}

#[tauri::command]
pub async fn mask_screenshot_ocr(state: State<'_, Db>, id: String) -> Result<Screenshot, String> {
    let s = state.lock().await;
    let mut ss = s.db.get_screenshot(&id).map_err(|e| e.to_string())?.ok_or_else(|| "Not found".to_string())?;
    if let Some(ref ocr) = ss.ocr_text.clone() {
        ss.ocr_masked = Some(masking::mask_sensitive(ocr));
        ss.has_sensitive = masking::has_sensitive_content(ocr);
        s.db.update_screenshot(&ss).map_err(|e| e.to_string())?;
    }
    Ok(ss)
}

#[tauri::command]
pub async fn lock_archive(state: State<'_, Db>, app: tauri::AppHandle, password: String) -> Result<usize, String> {
    if password.len() < 8 { return Err("Password must be at least 8 characters".into()); }
    let (images_dir, db, cancel_flag) = {
        let s = state.lock().await;
        (s.images_dir.clone(), s.db.clone(), s.archive_cancel.clone())
    };
    // FIX: Relaxed ordering is sufficient for a simple boolean cancel flag.
    // SeqCst (sequentially consistent) adds a full memory barrier — unnecessary here
    // since we only need the flag value itself, not ordering relative to other memory ops.
    cancel_flag.store(false, Ordering::Relaxed);
    let files = crypto::list_encryptable_images(&images_dir).map_err(|e| e.to_string())?;
    let total = files.len();
    let mut done = 0usize;
    for chunk in files.chunks(32) {
        let mut jobs = Vec::with_capacity(chunk.len());
        for path in chunk {
            if cancel_flag.load(Ordering::Relaxed) {
                app.emit_all("archive:cancelled", serde_json::json!({"done": done, "total": total})).ok();
                return Err("Archive encryption cancelled".into());
            }
            let p = path.clone(); let pw = password.clone(); let cancel = cancel_flag.clone();
            jobs.push(tokio::task::spawn_blocking(move || {
                if cancel.load(Ordering::Relaxed) { return Ok(false); }
                crypto::encrypt_file(&p, &pw).map(|_| true)
            }));
        }
        for job in jobs { let changed = job.await.map_err(|e| e.to_string())??; if changed { done += 1; } }
        app.emit_all("archive:progress", serde_json::json!({"mode": "lock", "done": done, "total": total})).ok();
    }
    let mut settings = db.load_settings();
    settings.archive_locked = true;
    settings.archive_password_hash = crypto::hash_password(&password);
    db.save_settings(&settings).map_err(|e| e.to_string())?;
    get_cache().clear();
    app.emit_all("archive:done", serde_json::json!({"mode": "lock", "done": done, "total": total})).ok();
    Ok(done)
}

#[tauri::command]
pub async fn unlock_archive(state: State<'_, Db>, app: tauri::AppHandle, password: String) -> Result<usize, String> {
    let (images_dir, db, cancel_flag) = {
        let s = state.lock().await;
        (s.images_dir.clone(), s.db.clone(), s.archive_cancel.clone())
    };
    let settings = db.load_settings();
    if !settings.archive_locked { return Err("Archive is already unlocked".into()); }
    if !settings.archive_password_hash.is_empty() && !crypto::verify_password(&password, &settings.archive_password_hash) {
        return Err("Incorrect password".into());
    }
    cancel_flag.store(false, Ordering::Relaxed);
    let files = crypto::list_decryptable_images(&images_dir).map_err(|e| e.to_string())?;
    let total = files.len();
    let mut done = 0usize;
    for chunk in files.chunks(32) {
        let mut jobs = Vec::with_capacity(chunk.len());
        for path in chunk {
            if cancel_flag.load(Ordering::Relaxed) { return Err("Archive decryption cancelled".into()); }
            let p = path.clone(); let pw = password.clone(); let cancel = cancel_flag.clone();
            jobs.push(tokio::task::spawn_blocking(move || {
                if cancel.load(Ordering::Relaxed) { return Ok(false); }
                crypto::decrypt_file(&p, &pw).map(|_| true)
            }));
        }
        for job in jobs { let changed = job.await.map_err(|e| e.to_string())??; if changed { done += 1; } }
        app.emit_all("archive:progress", serde_json::json!({"mode": "unlock", "done": done, "total": total})).ok();
    }
    let mut s = settings;
    s.archive_locked = false;
    if crypto::is_legacy_pbkdf2_hash(&s.archive_password_hash) {
        s.archive_password_hash = crypto::hash_password(&password);
    }
    db.save_settings(&s).map_err(|e| e.to_string())?;
    app.emit_all("archive:done", serde_json::json!({"mode": "unlock", "done": done, "total": total})).ok();
    Ok(done)
}

#[tauri::command]
pub async fn get_archive_status(state: State<'_, Db>) -> Result<bool, String> {
    Ok(state.lock().await.db.load_settings().archive_locked)
}

#[tauri::command]
pub async fn is_archive_password_set(state: State<'_, Db>) -> Result<bool, String> {
    Ok(!state.lock().await.db.load_settings().archive_password_hash.trim().is_empty())
}

#[tauri::command]
pub async fn verify_archive_password(state: State<'_, Db>, password: String) -> Result<bool, String> {
    let settings = state.lock().await.db.load_settings();
    if settings.archive_password_hash.trim().is_empty() { return Ok(true); }
    Ok(crypto::verify_password(&password, &settings.archive_password_hash))
}

#[tauri::command]
pub async fn cancel_archive_operation(state: State<'_, Db>) -> Result<(), String> {
    state.lock().await.archive_cancel.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn find_duplicates(state: State<'_, Db>) -> Result<Vec<DuplicateInfo>, String> {
    let (settings, db) = { let s = state.lock().await; (s.db.load_settings(), s.db.clone()) };
    if !settings.dedup_enabled { return Ok(vec![]); }
    let q = SearchQuery { limit: 5000, ..Default::default() };
    let screenshots = db.search_screenshots(&q).map_err(|e| e.to_string())?;
    let with_hash: Vec<_> = screenshots.iter()
        .filter_map(|ss| ss.phash.as_ref().and_then(|h| u64::from_str_radix(h, 16).ok().map(|n| (ss.id.clone(), n))))
        .collect();
    let mut dupes = Vec::new();
    let threshold = settings.dedup_threshold;
    let mut seen: Vec<(String, u64)> = Vec::new();
    for (id, hash) in with_hash {
        for (other_id, other_hash) in &seen {
            let dist = (hash ^ other_hash).count_ones();
            if dist <= threshold && other_id != &id {
                dupes.push(DuplicateInfo { original_id: other_id.clone(), duplicate_id: id.clone(), hamming_distance: dist });
            }
        }
        seen.push((id, hash));
    }
    Ok(dupes)
}

#[tauri::command]
pub async fn delete_duplicate(state: State<'_, Db>, id: String) -> Result<(), String> {
    delete_screenshot(state, id).await
}

#[tauri::command]
pub async fn get_corrections(state: State<'_, Db>, limit: Option<i64>) -> Result<Vec<UserCorrection>, String> {
    state.lock().await.db.get_corrections(limit.unwrap_or(100)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_processing_logs(state: State<'_, Db>, limit: Option<i64>) -> Result<Vec<ProcessingLogEntry>, String> {
    let db = state.lock().await.db.clone();
    let rows = db.get_processing_logs(limit.unwrap_or(200)).map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|(created_at, screenshot_id, stage, level, message)| {
        ProcessingLogEntry { created_at, screenshot_id, stage, level, message }
    }).collect())
}

#[tauri::command]
pub async fn detect_text_language(text: String) -> Result<String, String> {
    let code = crate::ocr::detect_language(&text);
    Ok(format!("{} ({})", crate::ocr::lang_display_name(&code), code))
}

#[tauri::command]
pub async fn apply_shell_language(app: tauri::AppHandle, lang: String) -> Result<(), String> {
    let en = lang.trim().eq_ignore_ascii_case("en");
    let tray = app.tray_handle();
    tray.get_item("show").set_title(if en { "Show WhatWasThat" } else { "WhatWasThat'ı Göster" }).map_err(|e| e.to_string())?;
    tray.get_item("quit").set_title(if en { "Quit" } else { "Çıkış" }).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_suggested_exclusions() -> Result<Vec<String>, String> {
    Ok(app_info::suggested_exclusions().iter().map(|s| s.to_string()).collect())
}

#[tauri::command]
pub async fn get_current_app() -> Result<Option<String>, String> {
    Ok(app_info::get_foreground_app())
}

#[tauri::command]
pub async fn export_wwt(state: State<'_, Db>, id: String, out_dir: Option<String>) -> Result<String, String> {
    let s = state.lock().await;
    let ss = s.db.get_screenshot(&id).map_err(|e| e.to_string())?.ok_or_else(|| "Not found".to_string())?;
    let base_dir = out_dir.map(std::path::PathBuf::from)
        .unwrap_or_else(|| s.images_dir.parent().unwrap_or(&s.images_dir).join("exports"));
    std::fs::create_dir_all(&base_dir).map_err(|e| e.to_string())?;
    let safe_title = ss.title.as_deref().unwrap_or("screenshot")
        .chars().map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' }).take(40).collect::<String>();
    let out_path = base_dir.join(format!("{}_{}.wwt", &ss.created_at[..10], safe_title));
    crate::wwt::export_wwt(&ss, &out_path)?;
    Ok(out_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn bulk_export_wwt(state: State<'_, Db>, ids: Vec<String>, out_dir: Option<String>) -> Result<usize, String> {
    let s = state.lock().await;
    let screenshots = s.db.get_screenshots_by_ids(&ids).map_err(|e| e.to_string())?;
    let base_dir = out_dir.map(std::path::PathBuf::from)
        .unwrap_or_else(|| s.images_dir.parent().unwrap_or(&s.images_dir).join("exports"));
    crate::wwt::bulk_export_wwt(&screenshots, &base_dir)
}

#[tauri::command]
pub async fn import_wwt(state: State<'_, Db>, wwt_path: String) -> Result<Screenshot, String> {
    let path = std::path::Path::new(&wwt_path);
    let (meta, image_bytes, ocr_text) = crate::wwt::import_wwt(path)?;
    let s = state.lock().await;
    if let Ok(Some(_)) = s.db.get_screenshot(&meta.id) {
        return Err(format!("Already in archive: {}", meta.id));
    }
    let img_path = s.images_dir.join(format!("{}_imported.png", meta.id));
    std::fs::write(&img_path, &image_bytes).map_err(|e| format!("Save failed: {}", e))?;
    let thumb = crate::ocr::generate_thumbnail(&img_path);
    let phash_val = crate::phash::compute_phash(&img_path).map(|h| crate::phash::hash_to_hex(h));
    let ss = Screenshot {
        id: meta.id.clone(), timestamp: meta.created_at.clone(),
        image_path: img_path.to_string_lossy().to_string(),
        image_thumb: thumb, ocr_text, ocr_masked: None,
        has_sensitive: meta.has_sensitive, title: meta.title, description: meta.description,
        category: meta.category, tags: meta.tags, source_hint: meta.source_hint,
        app_info: meta.app_info, confidence: meta.confidence,
        detected_language: meta.detected_language, phash: phash_val,
        is_favorite: meta.is_favorite, is_archived: false,
        status: "done".to_string(), error_msg: None, created_at: meta.created_at,
    };
    s.db.insert_screenshot(&ss).map_err(|e| e.to_string())?;
    if let Some(ref t) = ss.image_thumb { get_cache().set(&ss.id, t.clone()); }
    Ok(ss)
}

#[tauri::command]
pub async fn import_images(
    state: State<'_, Db>,
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<Vec<Screenshot>, String> {
    let (settings, db, images_dir) = {
        let s = state.lock().await;
        (s.db.load_settings(), s.db.clone(), s.images_dir.clone())
    };

    let mut imported = Vec::new();

    for src_path_str in paths {
        let src_path = std::path::Path::new(&src_path_str);
        if !src_path.exists() { continue; }

        let ext = src_path.extension().and_then(|e| e.to_str()).unwrap_or("png").to_lowercase();
        if ext != "png" && ext != "jpg" && ext != "jpeg" && ext != "bmp" && ext != "gif" && ext != "webp" {
            continue;
        }

        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now();
        let ts = now.format("%Y-%m-%dT%H:%M:%SZ").to_string();
        let dest_filename = format!("{}_{}_imported.png", now.format("%Y%m%d_%H%M%S_%3f"), &id[..8]);
        let dest_path = images_dir.join(&dest_filename);

        match image::open(src_path) {
            Ok(img) => {
                if let Err(e) = img.save(&dest_path) {
                    log::warn!("Could not save imported image {}: {}", src_path_str, e);
                    continue;
                }
            }
            Err(e) => {
                log::warn!("Could not open image {}: {}", src_path_str, e);
                continue;
            }
        }

        let thumb = crate::ocr::generate_thumbnail(&dest_path);
        let phash_val = crate::phash::compute_phash(&dest_path).map(|h| crate::phash::hash_to_hex(h));

        if settings.dedup_enabled {
            if let Some(ref ph) = phash_val {
                if let Ok(similar) = db.find_similar_phash(ph, settings.dedup_threshold) {
                    if !similar.is_empty() {
                        log::info!("Skipping duplicate import: {}", src_path_str);
                        continue;
                    }
                }
            }
        }

        let ss = Screenshot {
            id: id.clone(), timestamp: ts.clone(),
            image_path: dest_path.to_string_lossy().to_string(),
            image_thumb: thumb.clone(), ocr_text: None, ocr_masked: None,
            has_sensitive: false, title: None, description: None, category: None,
            tags: vec![], source_hint: None, app_info: Some("Imported".to_string()),
            confidence: None, detected_language: None, phash: phash_val,
            is_favorite: false, is_archived: false,
            status: "pending".to_string(), error_msg: None, created_at: ts,
        };

        if let Err(e) = db.insert_screenshot(&ss) {
            log::warn!("DB insert failed for {}: {}", src_path_str, e);
            continue;
        }

        if let Some(ref t) = thumb { get_cache().set(&id, t.clone()); }
        app.emit_all("screenshot:new", &ss).unwrap_or_default();

        if settings.auto_process {
            let db_q = db.clone();
            let settings_q = settings.clone();
            let ss_q = ss.clone();
            let app_q = app.clone();
            tokio::spawn(async move {
                let updated = process_one(ss_q, &settings_q, &db_q).await;
                app_q.emit_all("screenshot:done", &updated).unwrap_or_default();
            });
        }

        imported.push(ss);
    }

    Ok(imported)
}

#[tauri::command]
pub async fn get_export_dir(state: State<'_, Db>) -> Result<String, String> {
    let s = state.lock().await;
    Ok(s.images_dir.parent().unwrap_or(&s.images_dir).join("exports").to_string_lossy().to_string())
}

#[tauri::command]
pub async fn open_exports_folder(state: State<'_, Db>) -> Result<(), String> {
    let dir = get_export_dir(state).await?;
    std::fs::create_dir_all(&dir).ok();
    #[cfg(target_os = "windows")] std::process::Command::new("explorer").arg(&dir).spawn().ok();
    #[cfg(target_os = "macos")] std::process::Command::new("open").arg(&dir).spawn().ok();
    #[cfg(target_os = "linux")] std::process::Command::new("xdg-open").arg(&dir).spawn().ok();
    Ok(())
}

#[tauri::command]
pub async fn pick_files() -> Result<Vec<String>, String> {
    let paths = tauri::async_runtime::spawn_blocking(|| {
        tauri::api::dialog::blocking::FileDialogBuilder::new()
            .set_title("Select Images or Archives to Import")
            .add_filter("Images & WWT Archives", &["png", "jpg", "jpeg", "bmp", "gif", "webp", "wwt"])
            .add_filter("Images", &["png", "jpg", "jpeg", "bmp", "gif", "webp"])
            .add_filter("WWT Archives", &["wwt"])
            .pick_files()
            .unwrap_or_default()
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect::<Vec<String>>()
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(paths)
}
