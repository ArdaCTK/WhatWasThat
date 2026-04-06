use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Screenshot {
    pub id: String, pub timestamp: String, pub image_path: String,
    pub image_thumb: Option<String>, pub ocr_text: Option<String>,
    pub ocr_masked: Option<String>, pub has_sensitive: bool,
    pub title: Option<String>, pub description: Option<String>,
    pub category: Option<String>, pub tags: Vec<String>,
    pub source_hint: Option<String>, pub app_info: Option<String>,
    pub confidence: Option<f64>, pub detected_language: Option<String>,
    pub phash: Option<String>, pub is_favorite: bool, pub is_archived: bool,
    pub status: String, pub error_msg: Option<String>, pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category { pub name: String, pub color: String, pub icon: String, pub count: i64 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomCategory {
    pub name: String,
    pub icon: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub llm_provider: String, pub openai_api_key: String,
    pub openai_model: String, pub openai_base_url: String,
    pub ollama_url: String, pub ollama_model: String,
    pub auto_process: bool, pub ocr_language: String, pub ui_language: String,
    pub poll_interval_ms: u64, pub theme: String, pub accent_color: String,
    pub low_confidence_threshold: f64, pub show_notifications: bool,
    pub excluded_apps: Vec<String>, pub dedup_enabled: bool,
    pub dedup_threshold: u32, pub queue_concurrency: usize,
    pub masking_enabled: bool, pub archive_locked: bool,
    pub archive_password_hash: String, pub local_api_token: String,
    pub local_api_allowed_origins: Vec<String>,
    pub local_api_rate_limit_per_min: u32,
    pub personalization_enabled: bool, pub personalization_min_samples: u32,
    pub custom_categories: Vec<CustomCategory>,
    #[serde(default)]
    pub hidden_default_categories: Vec<String>,
    #[serde(default)]
    pub run_on_startup: bool,
    /// FIX: Send the screenshot image alongside OCR text to multimodal LLMs.
    /// When true and the provider supports vision (gpt-4o, llava, etc.),
    /// the image is resized and base64-encoded alongside the OCR text.
    /// Falls back to text-only if the model returns a vision error.
    #[serde(default = "default_true")]
    pub llm_use_vision: bool,
}

fn default_true() -> bool { true }

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            llm_provider: "none".into(), openai_api_key: String::new(),
            openai_model: "gpt-4o-mini".into(),
            openai_base_url: "https://api.openai.com/v1".into(),
            ollama_url: "http://localhost:11434".into(), ollama_model: "llava".into(),
            auto_process: true, ocr_language: "tur+eng".into(),
            ui_language: "en".into(), poll_interval_ms: 800,
            theme: "dark".into(), accent_color: "#58a6ff".into(),
            low_confidence_threshold: 0.6, show_notifications: true,
            excluded_apps: vec![], dedup_enabled: true, dedup_threshold: 10,
            queue_concurrency: 2, masking_enabled: true, archive_locked: false,
            archive_password_hash: String::new(), local_api_token: String::new(),
            local_api_allowed_origins: vec![
                "chrome-extension://*".into(), "moz-extension://*".into(),
                "http://localhost:*".into(), "http://127.0.0.1:*".into(),
            ],
            local_api_rate_limit_per_min: 180,
            personalization_enabled: true, personalization_min_samples: 2,
            custom_categories: vec![],
            hidden_default_categories: vec![],
            run_on_startup: false,
            llm_use_vision: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    pub query: Option<String>, pub category: Option<String>,
    pub tags: Vec<String>, pub date_from: Option<String>,
    pub date_to: Option<String>, pub only_low_confidence: bool,
    pub only_favorites: bool,
    pub only_archived: bool,
    pub include_archived: bool,
    #[serde(default)]
    pub only_error: bool,
    pub limit: i64, pub offset: i64,
}

impl Default for SearchQuery {
    fn default() -> Self {
        Self {
            query: None, category: None, tags: vec![], date_from: None,
            date_to: None, only_low_confidence: false, only_favorites: false,
            only_archived: false, include_archived: false, only_error: false,
            limit: 50, offset: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmAnalysis {
    pub title: String, pub description: String, pub category: String,
    pub tags: Vec<String>, pub source_hint: Option<String>, pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stats {
    pub total: i64, pub by_category: Vec<CategoryCount>,
    pub by_date: Vec<DateCount>, pub processing_pending: i64,
    pub low_confidence_count: i64, pub favorites_count: i64,
    pub sensitive_count: i64, pub duplicate_count: i64,
    pub error_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryCount { pub category: String, pub count: i64 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateCount { pub date: String, pub count: i64 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BulkReprocessResult { pub queued: u32, pub ids: Vec<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserCorrection {
    pub screenshot_id: String, pub old_category: Option<String>,
    pub new_category: String, pub old_tags: Vec<String>,
    pub new_tags: Vec<String>, pub corrected_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DuplicateInfo {
    pub original_id: String, pub duplicate_id: String, pub hamming_distance: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats { pub entries: usize, pub size_mb: f64, pub queue_slots: usize }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingLogEntry {
    pub created_at: String, pub screenshot_id: Option<String>,
    pub stage: String, pub level: String, pub message: String,
}
