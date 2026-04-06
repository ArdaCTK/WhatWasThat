/**
 * WhatWasThat — Translations
 *
 * HOW TO ADD A NEW LANGUAGE
 * 1. Add a new key to the TRANSLATIONS object below (e.g. 'es', 'ja', 'zh').
 * 2. Copy the 'en' block and translate every value.
 * 3. Open a pull request — that's it!
 *
 * Language codes follow ISO 639-1 (https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes).
 */

export type SupportedLang = 'en' | 'tr' | (string & {});

export interface LangMap {
  // Navigation
  nav_gallery: string;
  nav_stats: string;
  nav_settings: string;

  // Titlebar
  titlebar_subtitle: string;
  titlebar_minimize: string;
  titlebar_maximize: string;
  titlebar_hide: string;

  // Sidebar / filters
  sidebar_view: string;
  sidebar_all: string;
  sidebar_favorites: string;
  sidebar_low_confidence: string;
  sidebar_archive: string;
  sidebar_categories: string;
  sidebar_advanced_filter: string;
  fp_tag_add: string;
  sidebar_errors: string;

  // Gallery topbar
  gallery_search_placeholder: string;
  gallery_select_all: string;
  gallery_low_conf_btn: string;
  gallery_clear: string;
  gallery_processing: string;
  gallery_process_selected: string;
  gallery_no_results: string;
  gallery_no_records: string;
  gallery_change_filters: string;
  gallery_take_screenshot: string;
  gallery_filters: string;
  gallery_import_images: string;
  gallery_importing: string;
  gallery_import_success: string;

  // Screenshot detail
  detail_select_hint: string;
  /** FIX: fallback when screenshot has no title yet */
  detail_untitled: string;
  detail_title_label: string;
  detail_description_label: string;
  detail_category_label: string;
  detail_tags_label: string;
  detail_date: string;
  detail_language: string;
  detail_confidence: string;
  detail_ocr_text: string;
  detail_show_original: string;
  detail_show_masked: string;
  detail_save: string;
  detail_cancel: string;
  detail_edit: string;
  detail_reprocess: string;
  detail_stop: string;
  detail_low_conf_warning: string;
  detail_delete_confirm: string;

  // Stats
  stats_title: string;
  stats_subtitle: string;
  stats_total: string;
  stats_category: string;
  stats_low_conf: string;
  stats_click: string;
  stats_favorite: string;
  stats_sensitive: string;
  stats_duplicate: string;
  stats_category_dist: string;
  stats_no_category: string;
  stats_activity: string;
  stats_no_data: string;
  stats_recent_fixes: string;
  stats_fine_tuning: string;
  stats_learned_patterns: string;
  stats_no_learned: string;
  stats_learned_times: string;
  stats_tag_change: string;
  stats_actions: string;
  stats_processing: string;
  stats_reprocess_pending: string;
  stats_reprocess_low: string;
  stats_queued_low: string;
  stats_queued_pending: string;
  stats_records: string;

  // Settings
  settings_title: string;
  settings_subtitle: string;
  settings_ai: string;
  settings_provider: string;
  settings_disabled: string;
  settings_api_key: string;
  settings_model: string;
  settings_base_url: string;
  settings_ollama_url: string;
  settings_test: string;
  settings_testing: string;
  /** FIX: label for llm_use_vision toggle */
  settings_vision: string;
  /** FIX: hint text explaining vision mode */
  settings_vision_hint: string;
  settings_ocr: string;
  settings_ocr_lang: string;
  settings_app_lang: string;
  settings_behavior: string;
  settings_auto: string;
  settings_poll: string;
  settings_startup: string;
  settings_notifications: string;
  settings_show_notif: string;
  settings_excluded: string;
  settings_excluded_hint: string;
  settings_add: string;
  settings_perf: string;
  settings_dedup: string;
  settings_dedup_threshold: string;
  settings_queue: string;
  settings_sec: string;
  settings_mask: string;
  settings_archive_enc: string;
  settings_api_protect: string;
  settings_api_token: string;
  settings_allowed_origins: string;
  settings_rate_limit: string;
  settings_personalization: string;
  settings_personalization_on: string;
  settings_personalization_min: string;
  settings_categories: string;
  settings_categories_hint: string;
  settings_category_name: string;
  settings_category_icon: string;
  settings_category_color: string;
  settings_category_add: string;
  settings_category_delete: string;
  settings_logs: string;
  settings_no_logs: string;
  settings_storage: string;
  settings_images_folder: string;
  settings_exports_folder: string;
  settings_save: string;
  settings_saved: string;

  // Archive lock
  archive_locked: string;
  archive_open: string;
  archive_lock_placeholder: string;
  archive_unlock_placeholder: string;
  archive_confirm_placeholder: string;
  archive_lock_btn: string;
  archive_unlock_btn: string;
  archive_processing: string;
  archive_min_error: string;
  archive_mismatch: string;

  // Toast / notifications
  toast_deleted: string;
  toast_restored: string;
  toast_archived: string;
  toast_unarchived: string;
  toast_processing_stopped: string;
  toast_duplicate_detected: string;

  // Categories (built-in)
  cat_music: string;
  cat_film: string;
  cat_code: string;
  cat_news: string;
  cat_shopping: string;
  cat_food: string;
  cat_travel: string;
  cat_gaming: string;
  cat_book: string;
  cat_social: string;
  cat_work: string;
  cat_education: string;
  cat_other: string;
}

export const TRANSLATIONS: Record<SupportedLang, LangMap> = {
  en: {
    nav_gallery: 'Gallery',
    nav_stats: 'Stats',
    nav_settings: 'Settings',
    titlebar_subtitle: '/ screenshot archive',
    titlebar_minimize: 'Minimize',
    titlebar_maximize: 'Maximize',
    titlebar_hide: 'Hide to Tray',
    sidebar_view: 'view',
    sidebar_all: 'All',
    sidebar_favorites: 'Favorites',
    sidebar_low_confidence: 'Low Confidence',
    sidebar_archive: 'Archive',
    sidebar_categories: 'categories',
    sidebar_advanced_filter: 'Advanced Filter',
    fp_tag_add: 'Add tag...',
    sidebar_errors: 'Errors',
    gallery_search_placeholder: 'Search... (Ctrl+K)',
    gallery_select_all: 'Select All',
    gallery_low_conf_btn: 'Low Confidence',
    gallery_clear: 'Clear',
    gallery_processing: 'Processing',
    gallery_process_selected: 'record(s) reprocess',
    gallery_no_results: 'No results',
    gallery_no_records: 'No records yet',
    gallery_change_filters: 'Change filters or search terms.',
    gallery_take_screenshot: 'Press Win+Shift+S or Win+PrtSc to capture.',
    gallery_filters: 'filters',
    gallery_import_images: 'Import Images',
    gallery_importing: 'Importing...',
    gallery_import_success: 'images imported',
    detail_select_hint: 'Select a record',
    detail_untitled: 'Untitled',
    detail_title_label: 'Title',
    detail_description_label: 'Description',
    detail_category_label: 'Category',
    detail_tags_label: 'Tags',
    detail_date: 'Date',
    detail_language: 'Language',
    detail_confidence: 'Confidence',
    detail_ocr_text: 'OCR Text',
    detail_show_original: 'Show Original',
    detail_show_masked: 'Show Masked',
    detail_save: 'Save',
    detail_cancel: 'Cancel',
    detail_edit: 'Edit',
    detail_reprocess: 'Reprocess',
    detail_stop: 'Stop',
    detail_low_conf_warning: 'Low confidence — may be incorrect',
    detail_delete_confirm: 'Delete this record?',
    stats_title: 'Statistics',
    stats_subtitle: 'Archive overview',
    stats_total: 'Total',
    stats_category: 'Categories',
    stats_low_conf: 'Low Confidence',
    stats_click: 'Click',
    stats_favorite: 'Favorites',
    stats_sensitive: 'Sensitive',
    stats_duplicate: 'Duplicates',
    stats_category_dist: 'Category Distribution',
    stats_no_category: 'No categories yet.',
    stats_activity: 'Last 30 Days Activity',
    stats_no_data: 'No data yet.',
    stats_recent_fixes: 'Recent Corrections',
    stats_fine_tuning: '(saved for personalization)',
    stats_learned_patterns: 'Learned Patterns',
    stats_no_learned: 'No learned patterns yet. Edit a category or tags to start training.',
    stats_learned_times: 'times',
    stats_tag_change: 'tags',
    stats_actions: 'Actions',
    stats_processing: 'Processing...',
    stats_reprocess_pending: 'Reprocess Pending',
    stats_reprocess_low: 'Reprocess Low Confidence',
    stats_queued_low: 'low-confidence record(s) queued',
    stats_queued_pending: 'pending record(s) queued',
    stats_records: 'records',
    settings_title: 'Settings',
    settings_subtitle: 'WhatWasThat configuration',
    settings_ai: 'AI (LLM)',
    settings_provider: 'Provider',
    settings_disabled: 'Disabled',
    settings_api_key: 'API Key',
    settings_model: 'Model',
    settings_base_url: 'Base URL',
    settings_ollama_url: 'Ollama URL',
    settings_test: 'Test Connection',
    settings_testing: 'Testing...',
    settings_vision: 'Send screenshot image to AI (OCR + Image)',
    settings_vision_hint: 'Sends a resized copy of the screenshot alongside OCR text. Requires a vision-capable model (gpt-4o, llava, etc.). Falls back to text-only if the model does not support images.',
    settings_ocr: 'OCR',
    settings_ocr_lang: 'OCR Language',
    settings_app_lang: 'App Language',
    settings_behavior: 'Behavior',
    settings_auto: 'Auto-process new screenshots',
    settings_poll: 'Clipboard poll interval (ms)',
    settings_startup: 'Launch at system startup',
    settings_notifications: 'Notifications',
    settings_show_notif: 'Show desktop notifications',
    settings_excluded: 'Excluded Apps',
    settings_excluded_hint: 'Screenshots are ignored when these apps are in the foreground.',
    settings_add: 'Add',
    settings_perf: 'Performance',
    settings_dedup: 'Duplicate detection (pHash)',
    settings_dedup_threshold: 'Duplicate threshold',
    settings_queue: 'Queue concurrency',
    settings_sec: 'Security',
    settings_mask: 'Sensitive content masking',
    settings_archive_enc: 'Archive Encryption',
    settings_api_protect: 'Local API Protection',
    settings_api_token: 'API Token',
    settings_allowed_origins: 'Allowed Origins (comma-separated)',
    settings_rate_limit: 'Rate limit per minute',
    settings_personalization: 'Personalization',
    settings_personalization_on: 'Learn from my category corrections',
    settings_personalization_min: 'Minimum samples before applying learned category',
    settings_categories: 'Custom Categories',
    settings_categories_hint: 'Add custom categories for classification.',
    settings_category_name: 'Name',
    settings_category_icon: 'Icon',
    settings_category_color: 'Color',
    settings_category_add: 'Add Category',
    settings_category_delete: 'Delete',
    settings_logs: 'Processing Logs',
    settings_no_logs: 'No processing errors recorded yet.',
    settings_storage: 'Storage',
    settings_images_folder: 'Open Images Folder',
    settings_exports_folder: 'Open Exports Folder',
    settings_save: 'Save Settings',
    settings_saved: 'Saved!',
    archive_locked: 'Archive is locked',
    archive_open: 'Archive is unlocked',
    archive_lock_placeholder: 'Set a lock password (min 8 chars)',
    archive_unlock_placeholder: 'Enter unlock password',
    archive_confirm_placeholder: 'Confirm password',
    archive_lock_btn: 'Lock Archive',
    archive_unlock_btn: 'Unlock Archive',
    archive_processing: 'Processing...',
    archive_min_error: 'Password must be at least 8 characters',
    archive_mismatch: 'Passwords do not match',
    toast_deleted: 'deleted',
    toast_restored: 'restored',
    toast_archived: 'Archived',
    toast_unarchived: 'Removed from archive',
    toast_processing_stopped: 'Processing stopped',
    toast_duplicate_detected: 'Duplicate screenshot detected',
    cat_music: 'Music',
    cat_film: 'Film/TV',
    cat_code: 'Code/Tech',
    cat_news: 'News',
    cat_shopping: 'Shopping',
    cat_food: 'Food',
    cat_travel: 'Travel',
    cat_gaming: 'Gaming',
    cat_book: 'Books',
    cat_social: 'Social Media',
    cat_work: 'Work',
    cat_education: 'Education',
    cat_other: 'Other',
  },

  tr: {
    nav_gallery: 'Galeri',
    nav_stats: 'İstatistik',
    nav_settings: 'Ayarlar',
    titlebar_subtitle: '/ ekran görüntüsü arşivi',
    titlebar_minimize: 'Küçült',
    titlebar_maximize: 'Büyüt',
    titlebar_hide: 'Sistem Tepsisine Gizle',
    sidebar_view: 'görünüm',
    sidebar_all: 'Tümü',
    sidebar_favorites: 'Favoriler',
    sidebar_low_confidence: 'Düşük Güven',
    sidebar_archive: 'Arşiv',
    sidebar_categories: 'kategoriler',
    sidebar_advanced_filter: 'Gelişmiş Filtre',
    fp_tag_add: 'Etiket ekle...',
    sidebar_errors: 'Hatalar',
    gallery_search_placeholder: 'Ara... (Ctrl+K)',
    gallery_select_all: 'Tümünü Seç',
    gallery_low_conf_btn: 'Düşük Güven',
    gallery_clear: 'Temizle',
    gallery_processing: 'İşleniyor',
    gallery_process_selected: 'kayıt yeniden işle',
    gallery_no_results: 'Sonuç bulunamadı',
    gallery_no_records: 'Henüz kayıt yok',
    gallery_change_filters: 'Filtrelerinizi veya arama teriminizi değiştirin.',
    gallery_take_screenshot: 'Win+Shift+S veya Win+PrtSc ile ekran görüntüsü alın.',
    gallery_filters: 'filtre',
    gallery_import_images: 'Görüntü İçe Aktar',
    gallery_importing: 'İçe aktarılıyor...',
    gallery_import_success: 'görüntü içe aktarıldı',
    detail_select_hint: 'Bir kayıt seçin',
    detail_untitled: 'Başlıksız',
    detail_title_label: 'Başlık',
    detail_description_label: 'Açıklama',
    detail_category_label: 'Kategori',
    detail_tags_label: 'Etiketler',
    detail_date: 'Tarih',
    detail_language: 'Dil',
    detail_confidence: 'Güven',
    detail_ocr_text: 'OCR Metni',
    detail_show_original: 'Orijinali Göster',
    detail_show_masked: 'Maskeli Göster',
    detail_save: 'Kaydet',
    detail_cancel: 'İptal',
    detail_edit: 'Düzenle',
    detail_reprocess: 'Yeniden İşle',
    detail_stop: 'Durdur',
    detail_low_conf_warning: 'Düşük güven — yanlış olabilir',
    detail_delete_confirm: 'Bu kayıt silinsin mi?',
    stats_title: 'İstatistikler',
    stats_subtitle: 'Arşivinizin özeti',
    stats_total: 'Toplam',
    stats_category: 'Kategoriler',
    stats_low_conf: 'Düşük Güven',
    stats_click: 'Tıkla',
    stats_favorite: 'Favoriler',
    stats_sensitive: 'Hassas',
    stats_duplicate: 'Tekrar',
    stats_category_dist: 'Kategori Dağılımı',
    stats_no_category: 'Henüz kategori yok.',
    stats_activity: 'Son 30 Günlük Aktivite',
    stats_no_data: 'Henüz veri yok.',
    stats_recent_fixes: 'Son Düzeltmeler',
    stats_fine_tuning: '(kişiselleştirme için kaydediliyor)',
    stats_learned_patterns: 'Öğrenilen Paternler',
    stats_no_learned: 'Henüz öğrenilen patern yok. Eğitim başlatmak için kategori veya etiket düzenleyin.',
    stats_learned_times: 'kez',
    stats_tag_change: 'etiket',
    stats_actions: 'İşlemler',
    stats_processing: 'İşleniyor...',
    stats_reprocess_pending: 'Bekleyenleri Yeniden İşle',
    stats_reprocess_low: 'Düşük Güvenileri Yeniden İşle',
    stats_queued_low: 'düşük güvenli kayıt kuyruğa alındı',
    stats_queued_pending: 'bekleyen kayıt kuyruğa alındı',
    stats_records: 'kayıt',
    settings_title: 'Ayarlar',
    settings_subtitle: 'WhatWasThat yapılandırması',
    settings_ai: 'Yapay Zeka (LLM)',
    settings_provider: 'Sağlayıcı',
    settings_disabled: 'Devre Dışı',
    settings_api_key: 'API Anahtarı',
    settings_model: 'Model',
    settings_base_url: 'Base URL',
    settings_ollama_url: 'Ollama URL',
    settings_test: 'Bağlantıyı Test Et',
    settings_testing: 'Test ediliyor...',
    settings_vision: 'Ekran görüntüsünü yapay zekaya gönder (OCR + Görsel)',
    settings_vision_hint: 'OCR metniyle birlikte yeniden boyutlandırılmış görüntü gönderir. Görsel destekli model gerektirir (gpt-4o, llava vb.). Model görüntüyü desteklemiyorsa otomatik olarak yalnızca metin moduna geçer.',
    settings_ocr: 'OCR',
    settings_ocr_lang: 'OCR Dili',
    settings_app_lang: 'Uygulama Dili',
    settings_behavior: 'Davranış',
    settings_auto: 'Yeni ekran görüntülerini otomatik işle',
    settings_poll: 'Pano kontrol aralığı (ms)',
    settings_startup: 'Sistem başlangıcında çalıştır',
    settings_notifications: 'Bildirimler',
    settings_show_notif: 'Masaüstü bildirimlerini göster',
    settings_excluded: 'Kapsam Dışı Uygulamalar',
    settings_excluded_hint: 'Bu uygulamalar ön plandayken ekran görüntüsü kaydedilmez.',
    settings_add: 'Ekle',
    settings_perf: 'Performans',
    settings_dedup: 'Yinelenen görüntü tespiti (pHash)',
    settings_dedup_threshold: 'Yineleme eşiği',
    settings_queue: 'Eşzamanlı işleme limiti',
    settings_sec: 'Güvenlik',
    settings_mask: 'Hassas içerik maskeleme',
    settings_archive_enc: 'Arşiv Şifreleme',
    settings_api_protect: 'Local API Koruması',
    settings_api_token: 'API Token',
    settings_allowed_origins: 'İzinli Originler (virgülle ayrılmış)',
    settings_rate_limit: 'Dakika başı istek limiti',
    settings_personalization: 'Kişiselleştirme',
    settings_personalization_on: 'Kategori düzeltmelerimden öğren',
    settings_personalization_min: 'Öğrenilen kategori için minimum örnek sayısı',
    settings_categories: 'Özel Kategoriler',
    settings_categories_hint: 'Sınıflandırma için özel kategoriler ekleyin.',
    settings_category_name: 'Ad',
    settings_category_icon: 'İkon',
    settings_category_color: 'Renk',
    settings_category_add: 'Kategori Ekle',
    settings_category_delete: 'Sil',
    settings_logs: 'İşleme Logları',
    settings_no_logs: 'Henüz işleme hatası kaydı yok.',
    settings_storage: 'Depolama',
    settings_images_folder: 'Görüntüler Klasörünü Aç',
    settings_exports_folder: 'Dışa Aktarımlar Klasörünü Aç',
    settings_save: 'Ayarları Kaydet',
    settings_saved: 'Kaydedildi!',
    archive_locked: 'Arşiv kilitli',
    archive_open: 'Arşiv açık',
    archive_lock_placeholder: 'Kilitleme şifresi (min 8 karakter)',
    archive_unlock_placeholder: 'Kilit açma şifresi',
    archive_confirm_placeholder: 'Şifreyi tekrar girin',
    archive_lock_btn: 'Arşivi Kilitle',
    archive_unlock_btn: 'Kilidi Aç',
    archive_processing: 'İşleniyor...',
    archive_min_error: 'Şifre en az 8 karakter olmalıdır',
    archive_mismatch: 'Şifreler eşleşmiyor',
    toast_deleted: 'silindi',
    toast_restored: 'geri alındı',
    toast_archived: 'Arşivlendi',
    toast_unarchived: 'Arşivden çıkarıldı',
    toast_processing_stopped: 'İşleme durduruldu',
    toast_duplicate_detected: 'Tekrar görüntü algılandı',
    cat_music: 'Müzik',
    cat_film: 'Film/Dizi',
    cat_code: 'Kod/Teknoloji',
    cat_news: 'Haber',
    cat_shopping: 'Alışveriş',
    cat_food: 'Yemek',
    cat_travel: 'Seyahat',
    cat_gaming: 'Oyun',
    cat_book: 'Kitap',
    cat_social: 'Sosyal Medya',
    cat_work: 'İş/Çalışma',
    cat_education: 'Eğitim',
    cat_other: 'Diğer',
  },
};

/** Returns the translation map for the given language, falling back to English. */
export function getLangMap(lang: SupportedLang): LangMap {
  return TRANSLATIONS[lang] ?? TRANSLATIONS['en'];
}

/** Translate a single key. Falls back to English, then to the key itself. */
export function t(lang: SupportedLang, key: keyof LangMap): string {
  return (TRANSLATIONS[lang] ?? TRANSLATIONS['en'])[key] ?? (TRANSLATIONS['en'] as LangMap)[key] ?? key;
}
