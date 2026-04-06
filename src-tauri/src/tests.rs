// Integration tests for WhatWasThat backend
// Run with: cargo test

#[cfg(test)]
mod tests {
    use crate::database::*;
    use crate::models::*;

    #[test]
    fn test_category_color() {
        // English canonical names (primary — these are what the LLM emits)
        assert_eq!(category_color("Music"),       "#a855f7");
        assert_eq!(category_color("Film/TV"),      "#3b82f6");
        assert_eq!(category_color("Code/Tech"),    "#22c55e");
        assert_eq!(category_color("News"),         "#ef4444");
        assert_eq!(category_color("Shopping"),     "#f97316");
        assert_eq!(category_color("Food"),         "#eab308");
        assert_eq!(category_color("Travel"),       "#06b6d4");
        assert_eq!(category_color("Gaming"),       "#ec4899");
        assert_eq!(category_color("Books"),        "#8b5cf6");
        assert_eq!(category_color("Social Media"), "#14b8a6");
        assert_eq!(category_color("Work"),         "#64748b");
        assert_eq!(category_color("Education"),    "#f59e0b");
        assert_eq!(category_color("Other"),        "#6b7280");
        // Turkish legacy aliases (backward compat)
        assert_eq!(category_color("Müzik"),        "#a855f7");
        assert_eq!(category_color("Kod/Teknoloji"),"#22c55e");
        assert_eq!(category_color("Bilinmeyen"),   "#6b7280");
    }

    #[test]
    fn test_category_icon() {
        // English canonical names
        assert_eq!(category_icon("Music"),       "🎵");
        assert_eq!(category_icon("Film/TV"),      "🎬");
        assert_eq!(category_icon("Code/Tech"),    "💻");
        assert_eq!(category_icon("News"),         "📰");
        assert_eq!(category_icon("Shopping"),     "🛒");
        assert_eq!(category_icon("Food"),         "🍽️");
        assert_eq!(category_icon("Travel"),       "✈️");
        assert_eq!(category_icon("Gaming"),       "🎮");
        assert_eq!(category_icon("Books"),        "📚");
        assert_eq!(category_icon("Social Media"), "💬");
        assert_eq!(category_icon("Work"),         "💼");
        assert_eq!(category_icon("Education"),    "🎓");
        assert_eq!(category_icon("Other"),        "📌");
        // Turkish legacy aliases
        assert_eq!(category_icon("Müzik"),        "🎵");
        assert_eq!(category_icon("Film/Dizi"),    "🎬");
        assert_eq!(category_icon("Bilinmeyen"),   "📌");
    }

    #[test]
    fn test_app_settings_default() {
        let s = AppSettings::default();
        assert_eq!(s.llm_provider, "none");
        assert_eq!(s.ocr_language, "tur+eng");
        assert_eq!(s.poll_interval_ms, 800);
        assert!(s.auto_process);
        assert!(s.hidden_default_categories.is_empty());
        assert!(s.custom_categories.is_empty());
    }

    #[test]
    fn test_search_query_default() {
        let q = SearchQuery::default();
        assert_eq!(q.limit, 50);
        assert_eq!(q.offset, 0);
        assert!(q.tags.is_empty());
        assert!(q.query.is_none());
    }

    #[test]
    fn test_database_migrate() {
        use crate::database::Database;
        use std::path::PathBuf;

        let tmp = std::env::temp_dir().join(format!(
            "wwt_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&tmp).unwrap();

        let db = Database::new(&tmp).expect("DB creation should succeed");

        // Insert a screenshot (all fields present)
        let ss = Screenshot {
            id: "test-id-1".into(),
            timestamp: "2024-01-01T00:00:00Z".into(),
            image_path: "/tmp/test.png".into(),
            image_thumb: None,
            ocr_text: Some("hello world".into()),
            ocr_masked: None,
            has_sensitive: false,
            title: Some("Test Title".into()),
            description: Some("Test description".into()),
            category: Some("Müzik".into()),
            tags: vec!["pop".into(), "rock".into()],
            source_hint: Some("Spotify".into()),
            app_info: None,
            confidence: Some(0.9),
            detected_language: Some("tur".into()),
            phash: None,
            is_favorite: false,
            is_archived: false,
            status: "done".into(),
            error_msg: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };

        db.insert_screenshot(&ss).expect("Insert should succeed");

        let fetched = db.get_screenshot("test-id-1").expect("Fetch should succeed");
        assert!(fetched.is_some());
        let fetched = fetched.unwrap();
        assert_eq!(fetched.id, "test-id-1");
        assert_eq!(fetched.title, Some("Test Title".into()));
        assert_eq!(fetched.tags, vec!["pop".to_string(), "rock".to_string()]);
        assert_eq!(fetched.category, Some("Müzik".into()));

        // Test search
        let query = SearchQuery {
            category: Some("Müzik".into()),
            ..Default::default()
        };
        let results = db.search_screenshots(&query).expect("Search should succeed");
        assert_eq!(results.len(), 1);

        // Test categories
        let cats = db.get_categories().expect("Get categories should succeed");
        assert_eq!(cats.len(), 1);
        assert_eq!(cats[0].name, "Müzik");
        assert_eq!(cats[0].count, 1);

        // Test stats
        let stats = db.get_stats().expect("Get stats should succeed");
        assert_eq!(stats.total, 1);

        // Test delete
        db.delete_screenshot("test-id-1")
            .expect("Delete should succeed");
        let after = db
            .get_screenshot("test-id-1")
            .expect("Fetch after delete should succeed");
        assert!(after.is_none());

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn test_settings_persist() {
        use crate::database::Database;

        let tmp = std::env::temp_dir().join(format!(
            "wwt_settings_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&tmp).unwrap();

        let db = Database::new(&tmp).expect("DB should be created");

        let mut settings = AppSettings::default();
        settings.llm_provider = "openai".into();
        settings.openai_model = "gpt-4o".into();
        settings.auto_process = false;

        db.save_settings(&settings).expect("Save should succeed");

        let loaded = db.load_settings();
        assert_eq!(loaded.llm_provider, "openai");
        assert_eq!(loaded.openai_model, "gpt-4o");
        assert!(!loaded.auto_process);

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn test_undo_stack() {
        use crate::undo::UndoStack;

        let mut stack = UndoStack::new();
        assert!(stack.is_empty());
        assert!(stack.peek().is_none());
        assert!(stack.pop().is_none());

        let ss = Screenshot {
            id: "test-1".into(),
            timestamp: "2024".into(),
            image_path: "/tmp/test.png".into(),
            image_thumb: None,
            ocr_text: None,
            ocr_masked: None,
            has_sensitive: false,
            title: Some("Test".into()),
            description: None,
            category: None,
            tags: vec![],
            source_hint: None,
            app_info: None,
            confidence: None,
            detected_language: None,
            phash: None,
            is_favorite: false,
            is_archived: false,
            status: "done".into(),
            error_msg: None,
            created_at: "2024".into(),
        };

        stack.push(ss.clone());
        assert_eq!(stack.len(), 1);
        assert_eq!(stack.peek().unwrap().id, "test-1");

        let popped = stack.pop().unwrap();
        assert_eq!(popped.id, "test-1");
        assert!(stack.is_empty());
    }

    #[test]
    fn test_app_exclusion() {
        use crate::app_info::is_app_excluded;
        let excluded = vec!["keepass".to_string(), "garanti".to_string()];
        assert!(is_app_excluded("KeePass.exe", &excluded));
        assert!(is_app_excluded("garanti.exe", &excluded));
        assert!(!is_app_excluded("chrome.exe", &excluded));
        assert!(!is_app_excluded("", &excluded));
    }

    #[test]
    fn test_masking_turkish_chars() {
        use crate::masking::*;
        let text = "WhatWasThat: akıllı ekran görüntüsü arşivi — şimdi daha iyi!";
        let result = mask_sensitive(text);
        assert_eq!(result, text);
    }

    #[test]
    fn test_crypto_roundtrip() {
        use crate::crypto::*;
        let plain = b"Merhaba WhatWasThat!";
        let enc = encrypt(plain, "pw123").unwrap();
        let dec = decrypt(&enc, "pw123").unwrap();
        assert_eq!(dec, plain);
    }

    #[test]
    fn test_crypto_wrong_password() {
        use crate::crypto::*;
        let enc = encrypt(b"secret", "correct").unwrap();
        assert!(decrypt(&enc, "wrong").is_err());
    }

    #[test]
    fn test_password_hash_argon2() {
        use crate::crypto::*;
        let h = hash_password("my_password");
        assert!(h.starts_with("$argon2"));
        assert!(verify_password("my_password", &h));
        assert!(!verify_password("wrong", &h));
    }

    #[test]
    fn test_phash_hamming() {
        use crate::phash::*;
        assert_eq!(hamming_distance(0xDEAD_BEEF_1234_5678, 0xDEAD_BEEF_1234_5678), 0);
        assert_eq!(hamming_distance(0, u64::MAX), 64);
        assert!(is_duplicate(42, 42, 10));
        let h = 0xABCD_EF01_2345_6789u64;
        let hex = hash_to_hex(h);
        assert_eq!(parse_hash(&hex), Some(h));
    }

    #[test]
    fn test_correction_learning_cycle() {
        use crate::database::Database;

        let tmp = std::env::temp_dir().join(format!(
            "wwt_correction_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&tmp).unwrap();
        let db = Database::new(&tmp).expect("DB should be created");

        // 1) Öğrenme yokken hiçbir sonuç gelmemeli
        let result = db.get_learned_category_for_source("Spotify").unwrap();
        assert!(result.is_none(), "Henüz düzeltme yok, None bekleniyor");

        // 2) Yeterli örnek olmadan (min_samples=2) sonuç gelmemeli
        let ss1 = Screenshot {
            id: "ss-1".into(), timestamp: "2024-01-01T00:00:00Z".into(),
            image_path: "/tmp/1.png".into(), image_thumb: None,
            ocr_text: None, ocr_masked: None, has_sensitive: false,
            title: None, description: None,
            category: Some("Other".into()), tags: vec![],
            source_hint: Some("Spotify".into()), app_info: None,
            confidence: Some(0.5), detected_language: None, phash: None,
            is_favorite: false, is_archived: false,
            status: "done".into(), error_msg: None,
            created_at: "2024-01-01T00:00:00Z".into(),
        };
        db.insert_screenshot(&ss1).unwrap();

        db.save_correction(&UserCorrection {
            screenshot_id: "ss-1".into(),
            old_category: Some("Other".into()),   // FIX: was "Other".into() — Option<String>
            new_category: "Music".into(),
            old_tags: vec![],
            new_tags: vec!["pop".into()],
            corrected_at: "2024-01-01T00:00:00Z".into(),
        }).unwrap();

        let (learned, count) = db.get_learned_category_for_source("Spotify").unwrap().unwrap();
        assert_eq!(learned, "Music");
        assert_eq!(count, 1);
        // min_samples=2 ile karşılaştır: 1 < 2 → öğrenme henüz aktif edilmemeli
        let settings = crate::models::AppSettings::default();
        assert!(count < settings.personalization_min_samples as i64,
            "1 örnek min_samples({}) eşiğini geçmemeli", settings.personalization_min_samples);

        // 3) İkinci düzeltme ekle → eşik aşılmalı
        let ss2 = Screenshot { id: "ss-2".into(), source_hint: Some("Spotify".into()), ..ss1.clone() };
        db.insert_screenshot(&ss2).unwrap();

        db.save_correction(&UserCorrection {
            screenshot_id: "ss-2".into(),
            old_category: Some("Other".into()),   // FIX: was "Other".into()
            new_category: "Music".into(),
            old_tags: vec![],
            new_tags: vec![],
            corrected_at: "2024-01-02T00:00:00Z".into(),
        }).unwrap();

        let (learned2, count2) = db.get_learned_category_for_source("Spotify").unwrap().unwrap();
        assert_eq!(learned2, "Music");
        assert_eq!(count2, 2);
        assert!(count2 >= settings.personalization_min_samples as i64,
            "2 örnek min_samples({}) eşiğini geçmeli", settings.personalization_min_samples);

        // 4) Farklı kaynak için sıfır bilgi olmalı
        let none = db.get_learned_category_for_source("YouTube").unwrap();
        assert!(none.is_none(), "Farklı kaynak için None bekleniyor");

        // 5) Boş source için erken dönüş kontrolü
        let empty = db.get_learned_category_for_source("").unwrap();
        assert!(empty.is_none(), "Boş source için None bekleniyor");

        // 6) Çoğunluk oyu: 2x Music, 1x Gaming → Music kazanmalı
        let ss3 = Screenshot { id: "ss-3".into(), source_hint: Some("Spotify".into()), ..ss1.clone() };
        db.insert_screenshot(&ss3).unwrap();
        db.save_correction(&UserCorrection {
            screenshot_id: "ss-3".into(),
            old_category: Some("Other".into()),   // FIX: was "Other".into()
            new_category: "Gaming".into(),
            old_tags: vec![],
            new_tags: vec![],
            corrected_at: "2024-01-03T00:00:00Z".into(),
        }).unwrap();

        let (majority, _) = db.get_learned_category_for_source("Spotify").unwrap().unwrap();
        assert_eq!(majority, "Music", "Çoğunluk oyu Music olmalı (2>1)");

        // 7) Tag öğrenmesi: min_samples=2 olan tag'ler dönmeli
        let learned_tags = db.get_learned_tags_for_source("Spotify", 2).unwrap();
        assert!(learned_tags.contains(&"pop".to_string()), "pop tag'i en az 2 kez geçiyor, öğrenilmeli");

        // 8) Eşiği geçemeyen tag dönmemeli
        let strict_tags = db.get_learned_tags_for_source("Spotify", 3).unwrap();
        assert!(!strict_tags.contains(&"pop".to_string()), "pop sadece 2 kez geçiyor, min=3 ile dönmemeli");

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn test_llm_parse() {
        use crate::llm::parse_llm_response;
        let json = r#"{"title":"Test","description":"Desc","category":"Music","tags":["pop"],"source_hint":"Spotify","confidence":0.92}"#;
        let r = parse_llm_response(json).unwrap();
        assert_eq!(r.title, "Test");
        assert_eq!(r.category, "Music");
        assert!((r.confidence - 0.92).abs() < 0.001);
    }
}
