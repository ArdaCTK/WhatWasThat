export interface Screenshot {
  id: string;
  timestamp: string;
  image_path: string;
  image_thumb?: string;
  ocr_text?: string;
  ocr_masked?: string;
  has_sensitive: boolean;
  title?: string;
  description?: string;
  category?: string;
  tags: string[];
  source_hint?: string;
  app_info?: string;
  confidence?: number;
  detected_language?: string;
  phash?: string;
  is_favorite: boolean;
  is_archived: boolean;
  status: 'pending' | 'processing' | 'done' | 'error';
  error_msg?: string;
  created_at: string;
}

export interface Category { name: string; color: string; icon: string; count: number; }

export interface CustomCategory { name: string; icon: string; color: string; }

export interface AppSettings {
  llm_provider: 'openai' | 'ollama' | 'none';
  openai_api_key: string;
  openai_model: string;
  openai_base_url: string;
  ollama_url: string;
  ollama_model: string;
  auto_process: boolean;
  ocr_language: string;
  ui_language: 'tr' | 'en' | string;
  poll_interval_ms: number;
  theme: 'dark' | 'light' | 'midnight' | 'forest';
  accent_color: string;
  low_confidence_threshold: number;
  show_notifications: boolean;
  excluded_apps: string[];
  dedup_enabled: boolean;
  dedup_threshold: number;
  queue_concurrency: number;
  masking_enabled: boolean;
  archive_locked: boolean;
  archive_password_hash: string;
  local_api_token: string;
  local_api_allowed_origins: string[];
  local_api_rate_limit_per_min: number;
  personalization_enabled: boolean;
  personalization_min_samples: number;
  custom_categories: CustomCategory[];
  run_on_startup: boolean;
  /** Send screenshot image alongside OCR text to multimodal LLMs (gpt-4o, llava, etc.) */
  llm_use_vision: boolean;
}

export interface SearchQuery {
  query?: string;
  category?: string;
  tags: string[];
  date_from?: string;
  date_to?: string;
  only_low_confidence: boolean;
  only_favorites: boolean;
  only_archived: boolean;
  include_archived: boolean;
  only_error: boolean;
  limit: number;
  offset: number;
}

export interface Stats {
  total: number;
  by_category: { category: string; count: number }[];
  by_date: { date: string; count: number }[];
  processing_pending: number;
  low_confidence_count: number;
  favorites_count: number;
  sensitive_count: number;
  duplicate_count: number;
  error_count: number;
}

export interface BulkReprocessResult { queued: number; ids: string[]; }

export interface UserCorrection {
  screenshot_id: string;
  old_category?: string;
  new_category: string;
  old_tags: string[];
  new_tags: string[];
  corrected_at: string;
}

export type ViewMode = 'grid' | 'list' | 'timeline' | 'masonry';
export type AppView = 'gallery' | 'settings' | 'stats';

export interface FilterState {
  query?: string;
  category?: string;
  tags: string[];
  date_from?: string;
  date_to?: string;
  only_low_confidence: boolean;
  only_favorites: boolean;
  only_archived: boolean;
  include_archived: boolean;
  only_error: boolean;
  app_filter?: string;
}

export interface ProcessingLogEntry {
  created_at: string;
  screenshot_id?: string;
  stage: string;
  level: string;
  message: string;
}

export interface CacheStats { entries: number; size_mb: number; queue_slots: number; }
