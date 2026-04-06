#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api_server;
mod app_info;
mod cache;
mod clipboard;
mod commands;
mod crypto;
mod database;
mod llm;
mod masking;
mod models;
mod ocr;
mod phash;
mod queue;
mod undo;
mod wwt;
#[cfg(test)]
mod tests;

use commands::AppState;
use database::Database;
use models::Screenshot;
use std::ffi::OsString;
use std::io::{Read, Write};
use std::net::{TcpListener as StdTcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem};
use tokio::sync::Mutex;
use uuid::Uuid;

/// Port used for single-instance IPC (prevent multiple app windows)
const SINGLE_INSTANCE_ADDR: &str = "127.0.0.1:27485";

/// Collects .wwt file paths passed as command-line arguments.
fn collect_wwt_args() -> Vec<String> {
    std::env::args_os().skip(1).filter_map(|a: OsString| {
        let s = a.to_string_lossy().to_string();
        let is_wwt = Path::new(&s).extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("wwt"))
            .unwrap_or(false);
        if is_wwt { Some(s) } else { None }
    }).collect()
}

/// Attempts to forward a command to an already-running instance via local TCP.
fn forward_to_running_instance(paths: &[String]) -> bool {
    let mut stream = match TcpStream::connect(SINGLE_INSTANCE_ADDR) { Ok(s) => s, Err(_) => return false };
    let payload = if paths.is_empty() { "SHOW\n".to_string() } else { format!("{}\n", paths.join("\n")) };
    let _ = stream.write_all(payload.as_bytes());
    true
}

fn import_wwt_into_db(db: &Arc<Database>, images_dir: &PathBuf, wwt_path: &str) -> Result<Screenshot, String> {
    let path = Path::new(wwt_path);
    let (meta, image_bytes, ocr_text) = crate::wwt::import_wwt(path)?;
    if let Ok(Some(_)) = db.get_screenshot(&meta.id) {
        return Err(format!("Already exists: {}", meta.id));
    }
    let img_path = images_dir.join(format!("{}_imported.png", meta.id));
    std::fs::write(&img_path, &image_bytes).map_err(|e| format!("Save failed: {}", e))?;
    let thumb = ocr::generate_thumbnail(&img_path);
    let phash_val = phash::compute_phash(&img_path).map(|h| phash::hash_to_hex(h));
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
    db.insert_screenshot(&ss).map_err(|e| e.to_string())?;
    if let Some(ref t) = ss.image_thumb { cache::get_cache().set(&ss.id, t.clone()); }
    Ok(ss)
}

fn process_external_command(cmd: &str, db: &Arc<Database>, images_dir: &PathBuf, app_handle: &tauri::AppHandle) {
    let text = cmd.trim();
    if text.is_empty() { return; }
    if text.eq_ignore_ascii_case("SHOW") {
        if let Some(w) = app_handle.get_window("main") { let _ = w.show(); let _ = w.set_focus(); }
        return;
    }
    if let Ok(ss) = import_wwt_into_db(db, images_dir, text) {
        app_handle.emit_all("screenshot:new", &ss).ok();
        app_handle.emit_all("wwt:opened", serde_json::json!({ "id": ss.id })).ok();
        if let Some(w) = app_handle.get_window("main") { let _ = w.show(); let _ = w.set_focus(); }
    }
}

#[cfg(target_os = "windows")]
fn register_wwt_file_association_windows() {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let exe = match std::env::current_exe() { Ok(p) => p.to_string_lossy().to_string(), Err(_) => return };
    let _ = std::process::Command::new("reg").args(["add", r"HKCU\Software\Classes\.wwt", "/ve", "/d", "WhatWasThat.wwt", "/f"]).creation_flags(CREATE_NO_WINDOW).output();
    let _ = std::process::Command::new("reg").args(["add", r"HKCU\Software\Classes\WhatWasThat.wwt", "/ve", "/d", "WhatWasThat Archive", "/f"]).creation_flags(CREATE_NO_WINDOW).output();
    let _ = std::process::Command::new("reg").args(["add", r"HKCU\Software\Classes\WhatWasThat.wwt\shell\open\command", "/ve", "/d", &format!("\"{}\" \"%1\"", exe), "/f"]).creation_flags(CREATE_NO_WINDOW).output();
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let startup_wwt_files = collect_wwt_args();
    if forward_to_running_instance(&startup_wwt_files) { return; }

    let single_instance_listener = StdTcpListener::bind(SINGLE_INSTANCE_ADDR)
        .expect("Failed to bind single-instance listener");
    let _ = single_instance_listener.set_nonblocking(true);

    let tray = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("show", "Show WhatWasThat"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "Quit"));

    tauri::Builder::default()
        .system_tray(SystemTray::new().with_menu(tray))
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(w) = app.get_window("main") { w.show().ok(); w.set_focus().ok(); }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => { if let Some(w) = app.get_window("main") { w.show().ok(); w.set_focus().ok(); } }
                "quit" => std::process::exit(0),
                _ => {}
            },
            _ => {}
        })
        .setup(move |app| {
            let app_dir = app.path_resolver().app_data_dir().unwrap_or_else(|| PathBuf::from("."));
            std::fs::create_dir_all(&app_dir).ok();
            let images_dir = app_dir.join("screenshots");
            std::fs::create_dir_all(&images_dir).ok();

            let db = Arc::new(Database::new(&app_dir).expect("Database initialisation failed"));
            let undo_stack = Arc::new(Mutex::new(undo::UndoStack::new()));
            let _ = db.recover_stuck_processing();

            app.manage(Arc::new(Mutex::new(AppState {
                db: db.clone(),
                images_dir: images_dir.clone(),
                undo_stack: undo_stack.clone(),
                archive_cancel: Arc::new(AtomicBool::new(false)),
            })));

            // Apply saved language to tray menu labels
            {
                let s = db.load_settings();
                let en = s.ui_language.trim().eq_ignore_ascii_case("en");
                let tray = app.tray_handle();
                #[cfg(target_os = "windows")]
                if let Err(e) = commands::set_windows_startup(s.run_on_startup) {
                    log::warn!("Could not refresh startup registration: {}", e);
                }
                let _ = tray.get_item("show").set_title(if en { "Show WhatWasThat" } else { "WhatWasThat'ı Göster" });
                let _ = tray.get_item("quit").set_title(if en { "Quit" } else { "Çıkış" });
            }

            #[cfg(target_os = "windows")]
            register_wwt_file_association_windows();

            // Single-instance IPC listener (receives .wwt paths and SHOW commands)
            {
                let listener = single_instance_listener.try_clone().ok();
                let db_ipc = db.clone();
                let dir_ipc = images_dir.clone();
                let app_ipc = app.handle();
                if let Some(listener) = listener {
                    std::thread::spawn(move || loop {
                        match listener.accept() {
                            Ok((mut stream, _)) => {
                                let mut buf = String::new();
                                if stream.read_to_string(&mut buf).is_ok() {
                                    for line in buf.lines() {
                                        process_external_command(line, &db_ipc, &dir_ipc, &app_ipc);
                                    }
                                }
                            }
                            Err(_) => std::thread::sleep(std::time::Duration::from_millis(120)),
                        }
                    });
                }
            }

            // Warm the thumbnail cache in a background thread
            {
                let db_warm = db.clone();
                let cache = cache::get_cache();
                std::thread::spawn(move || {
                    if let Ok(thumbs) = db_warm.get_all_thumbnails() { cache.warm_up(thumbs); }
                });
            }

            let app_handle = app.handle();
            let images_dir_c = images_dir.clone();
            let poll_ms = db.load_settings().poll_interval_ms;
            let db_for_clipboard = db.clone();
            let db_for_api = db.clone();

            clipboard::start_monitoring(poll_ms, move |capture| {
                let db_ref = db_for_clipboard.clone();
                let images_dir_ref = images_dir_c.clone();
                let app_ref = app_handle.clone();
                let rt = tokio::runtime::Runtime::new().unwrap();

                rt.block_on(async move {
                    let settings = db_ref.load_settings();

                    // Skip if the active app is in the exclusion list (clipboard source only)
                    if capture.source == clipboard::CaptureSource::Clipboard {
                        if let Some(ref app_name) = capture.app_name {
                            if app_info::is_app_excluded(app_name, &settings.excluded_apps) { return; }
                        }
                    }

                    // Deduplication check via pHash
                    if settings.dedup_enabled {
                        if let Some(h) = phash::compute_phash_from_bytes(&capture.bytes, capture.width, capture.height) {
                            let hex = phash::hash_to_hex(h);
                            if let Ok(similar) = db_ref.find_similar_phash(&hex, settings.dedup_threshold) {
                                if !similar.is_empty() {
                                    app_ref.emit_all("screenshot:duplicate", &serde_json::json!({
                                        "original_id": similar[0].0,
                                        "hamming": similar[0].2
                                    })).unwrap_or_default();
                                    return;
                                }
                            }
                        }
                    }

                    let id = Uuid::new_v4().to_string();
                    let now = chrono::Utc::now();
                    let ts = now.format("%Y-%m-%dT%H:%M:%SZ").to_string();
                    let filename = format!("{}.png", now.format("%Y%m%d_%H%M%S_%3f"));
                    let img_path = images_dir_ref.join(&filename);

                    if let Err(e) = ocr::save_image_bytes(&capture.bytes, capture.width, capture.height, &img_path) {
                        log::error!("Failed to save captured image: {}", e);
                        return;
                    }

                    let thumb = ocr::generate_thumbnail(&img_path);
                    if let Some(ref t) = thumb { cache::get_cache().set(&id, t.clone()); }
                    let img_phash = phash::compute_phash(&img_path).map(|h| phash::hash_to_hex(h));
                    let app_info_str = capture.app_name.as_deref().map(|n| {
                        let d = app_info::app_display_name(n);
                        if d.is_empty() { n.to_string() } else { d.to_string() }
                    });

                    let ss = Screenshot {
                        id: id.clone(), timestamp: ts.clone(),
                        image_path: img_path.to_string_lossy().to_string(),
                        image_thumb: thumb, ocr_text: None, ocr_masked: None,
                        has_sensitive: false, title: None, description: None, category: None,
                        tags: vec![], source_hint: None, app_info: app_info_str,
                        confidence: None, detected_language: None, phash: img_phash,
                        is_favorite: false, is_archived: false,
                        status: "pending".to_string(), error_msg: None, created_at: ts.clone(),
                    };

                    if let Err(e) = db_ref.insert_screenshot(&ss) {
                        log::error!("Failed to insert screenshot: {}", e);
                        return;
                    }

                    app_ref.emit_all("screenshot:new", &ss).unwrap_or_default();
                    if !settings.auto_process { return; }

                    // OCR — run with user-configured language, then re-run if a better language is detected
                    let initial = ocr::run_ocr(&img_path, &settings.ocr_language).unwrap_or_default();
                    let lang = ocr::detect_language(&initial);
                    let best_lang = ocr::best_tesseract_lang(&lang, &settings.ocr_language);
                    let ocr_text = if best_lang != settings.ocr_language && !initial.is_empty() {
                        ocr::run_ocr(&img_path, &best_lang).unwrap_or(initial)
                    } else {
                        initial
                    };

                    let (ocr_masked, has_sensitive) = if settings.masking_enabled && !ocr_text.is_empty() {
                        let sensitive = masking::has_sensitive_content(&ocr_text);
                        let masked = if sensitive { Some(masking::mask_sensitive(&ocr_text)) } else { None };
                        (masked, sensitive)
                    } else {
                        (None, false)
                    };

                    let mut updated = ss.clone();
                    updated.ocr_text = Some(ocr_text.clone());
                    updated.ocr_masked = ocr_masked;
                    updated.has_sensitive = has_sensitive;
                    updated.detected_language = Some(lang.clone());
                    updated.status = "processing".to_string();
                    let _ = db_ref.update_screenshot(&updated);
                    app_ref.emit_all("screenshot:processing", &id).unwrap_or_default();

                    let q = queue::get_queue();
                    let db_q = db_ref.clone();
                    let app_q = app_ref.clone();
                    let settings_q = settings.clone();
                    let updated_q = updated.clone();

                    q.submit(updated_q, settings_q, db_q, move |done| {
                        if settings.show_notifications {
                            if let Some(ref title) = done.title {
                                let cat = done.category.clone().unwrap_or_default();
                                let conf = done.confidence.map(|c| (c * 100.0) as u32).unwrap_or(0);
                                let body = format!("{} — {} ({}% confidence)", title, cat, conf);
                                app_q.emit_all("notification:show", &serde_json::json!({
                                    "title": "WhatWasThat",
                                    "body": body,
                                    "low_confidence": done.confidence.map(|c| c < settings.low_confidence_threshold).unwrap_or(false),
                                    "screenshot_id": done.id
                                })).unwrap_or_default();
                            }
                        }
                        app_q.emit_all("screenshot:done", &done).unwrap_or_default();
                    });
                });
            });

            // Start local API server for browser extension
            {
                let db_api = db_for_api;
                let dir_api = images_dir.clone();
                let app_api = app.handle();
                tauri::async_runtime::spawn(async move {
                    api_server::start_api_server(db_api, dir_api, app_api).await;
                });
            }

            // Process any .wwt files opened at startup
            for f in &startup_wwt_files {
                process_external_command(f, &db, &images_dir, &app.handle());
            }

            Ok(())
        })
        .on_window_event(|event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                event.window().hide().ok();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_screenshots, commands::get_screenshot,
            commands::delete_screenshot, commands::delete_screenshot_with_undo,
            commands::undo_delete, commands::peek_undo, commands::update_screenshot,
            commands::process_screenshot, commands::cancel_screenshot_processing,
            commands::bulk_reprocess, commands::reprocess_low_confidence, commands::reprocess_all_pending,
            commands::get_settings, commands::save_settings, commands::get_categories, commands::get_stats,
            commands::get_image_data, commands::get_thumbnail_cached, commands::warm_thumbnail_cache,
            commands::get_cache_stats, commands::clear_thumbnail_cache,
            commands::find_duplicates, commands::delete_duplicate,
            commands::detect_sensitive_content, commands::mask_screenshot_ocr,
            commands::lock_archive, commands::unlock_archive, commands::get_archive_status,
            commands::is_archive_password_set, commands::verify_archive_password, commands::cancel_archive_operation,
            commands::check_tesseract, commands::get_tesseract_path, commands::open_images_folder,
            commands::test_llm_connection, commands::get_corrections, commands::get_processing_logs,
            commands::detect_text_language, commands::apply_shell_language,
            commands::get_suggested_exclusions, commands::get_current_app,
            commands::export_wwt, commands::bulk_export_wwt, commands::import_wwt,
            commands::import_images,
            commands::pick_files,
            commands::get_export_dir, commands::open_exports_folder,
        ])
        .run(tauri::generate_context!())
        .expect("Application failed to start");
}
