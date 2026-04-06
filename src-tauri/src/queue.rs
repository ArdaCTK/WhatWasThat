use crate::database::Database;
use crate::llm::analyze_screenshot;
use crate::models::{AppSettings, Screenshot};
use crate::ocr::{best_tesseract_lang, detect_language, generate_thumbnail, run_ocr};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, Semaphore};

const DEFAULT_CONCURRENCY: usize = 2;
/// Increased from 60s → 120s to accommodate vision calls (llava is slow locally).
const PROCESS_TIMEOUT_SECS: u64 = 120;

pub struct ProcessingQueue {
    semaphore: Arc<Semaphore>,
    active: Arc<Mutex<std::collections::HashSet<String>>>,
    cancelled: Arc<Mutex<std::collections::HashSet<String>>>,
}

impl ProcessingQueue {
    pub fn new(max_concurrent: usize) -> Self {
        let concurrency = max_concurrent.max(1);
        Self {
            semaphore: Arc::new(Semaphore::new(concurrency)),
            active: Arc::new(Mutex::new(std::collections::HashSet::new())),
            cancelled: Arc::new(Mutex::new(std::collections::HashSet::new())),
        }
    }
    pub fn default_queue() -> Self { Self::new(DEFAULT_CONCURRENCY) }
    pub async fn is_active(&self, id: &str) -> bool { self.active.lock().await.contains(id) }
    pub fn available_slots(&self) -> usize { self.semaphore.available_permits() }
    pub async fn cancel(&self, id: &str) { self.cancelled.lock().await.insert(id.to_string()); }

    pub fn submit<F>(&self, ss: Screenshot, settings: AppSettings, db: Arc<Database>, on_done: F)
    where F: FnOnce(Screenshot) + Send + 'static {
        let sem = self.semaphore.clone();
        let active = self.active.clone();
        let cancelled = self.cancelled.clone();
        let id = ss.id.clone();
        tauri::async_runtime::spawn(async move {
            active.lock().await.insert(id.clone());
            let _permit = sem.acquire().await.unwrap();
            log::info!("Queue: processing {} (permit acquired)", id);
            let updated = process_one(ss, &settings, &db).await;
            let was_cancelled = cancelled.lock().await.remove(&id);
            let mut final_ss = updated.clone();
            if was_cancelled {
                final_ss.status = "error".to_string();
                final_ss.error_msg = Some("Processing cancelled by user".to_string());
                let _ = db.update_screenshot(&final_ss);
            }
            active.lock().await.remove(&id);
            on_done(final_ss);
        });
    }
}

pub async fn process_one(ss: Screenshot, settings: &AppSettings, db: &Arc<Database>) -> Screenshot {
    let image_path = Path::new(&ss.image_path).to_path_buf();
    let mut updated = ss.clone();
    let initial = run_ocr(&image_path, &settings.ocr_language).unwrap_or_default();
    let lang = detect_language(&initial);
    let best = best_tesseract_lang(&lang, &settings.ocr_language);
    let ocr_text = if best != settings.ocr_language && !initial.is_empty() {
        run_ocr(&image_path, &best).unwrap_or(initial)
    } else { initial };
    updated.ocr_text = Some(ocr_text.clone());
    updated.detected_language = Some(lang.clone());
    if settings.masking_enabled && !ocr_text.is_empty() {
        let sensitive = crate::masking::has_sensitive_content(&ocr_text);
        if sensitive { updated.ocr_masked = Some(crate::masking::mask_sensitive(&ocr_text)); updated.has_sensitive = true; }
    }
    if updated.image_thumb.is_none() { updated.image_thumb = generate_thumbnail(&image_path); }
    if updated.phash.is_none() {
        if let Some(h) = crate::phash::compute_phash(&image_path) { updated.phash = Some(crate::phash::hash_to_hex(h)); }
    }
    if settings.llm_provider != "none" {
        // Pass image_path so vision-capable providers can use OCR+Image mode
        let img_opt = if image_path.exists() { Some(image_path.as_path()) } else { None };
        match tokio::time::timeout(
            Duration::from_secs(PROCESS_TIMEOUT_SECS),
            analyze_screenshot(settings, &ocr_text, img_opt, Some(lang.as_str()))
        ).await {
            Ok(Ok(a)) => {
                updated.title = Some(a.title); updated.description = Some(a.description);
                updated.category = Some(a.category); updated.tags = a.tags;
                updated.source_hint = a.source_hint; updated.confidence = Some(a.confidence);
                updated.status = "done".to_string(); updated.error_msg = None;
            }
            Ok(Err(e)) => {
                updated.status = "error".to_string();
                updated.error_msg = Some(e.clone());
                let _ = db.add_processing_log(Some(&updated.id), "llm", "error", &e);
            }
            Err(_) => {
                updated.status = "error".to_string();
                updated.error_msg = Some(format!("LLM processing timeout ({}s)", PROCESS_TIMEOUT_SECS));
            }
        }
    } else {
        updated.confidence = Some(0.0); updated.status = "done".to_string();
    }
    if settings.personalization_enabled {
        let source = updated.source_hint.clone()
            .or_else(|| updated.app_info.clone())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        if let Some(ref src) = source {
            if let Ok(Some((learned_cat, count))) = db.get_learned_category_for_source(src) {
                if count >= settings.personalization_min_samples as i64
                    && updated.category.as_deref() != Some(learned_cat.as_str())
                {
                    updated.category = Some(learned_cat);
                    updated.confidence = Some(updated.confidence.unwrap_or(0.5).max(0.72));
                }
            }
            if let Ok(learned_tags) = db.get_learned_tags_for_source(src, settings.personalization_min_samples as i64) {
                if !learned_tags.is_empty() {
                    let mut merged = updated.tags.clone();
                    for tag in &learned_tags {
                        if !merged.iter().any(|t: &String| t.eq_ignore_ascii_case(tag)) {
                            merged.push(tag.clone());
                        }
                    }
                    updated.tags = merged;
                }
            }
        }
    }
    let _ = db.update_screenshot(&updated);
    updated
}

use std::sync::OnceLock;
static QUEUE: OnceLock<Arc<ProcessingQueue>> = OnceLock::new();
pub fn get_queue() -> Arc<ProcessingQueue> {
    QUEUE.get_or_init(|| Arc::new(ProcessingQueue::default_queue())).clone()
}
