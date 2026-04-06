use base64::Engine;
use image::GenericImageView;
use std::path::Path;
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn command_no_window(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")] { cmd.creation_flags(CREATE_NO_WINDOW); }
    cmd
}

pub fn find_tesseract_binary() -> Option<String> {
    if command_no_window("tesseract").arg("--version").output().is_ok() { return Some("tesseract".to_string()); }
    let candidates = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        "/usr/local/bin/tesseract","/opt/homebrew/bin/tesseract",
    ];
    for p in &candidates { if std::path::Path::new(p).exists() { return Some(p.to_string()); } }
    None
}

/// OCR IMPROVEMENTS:
/// 1. Preprocess small images: scale up to ≥1400px wide so characters are large
///    enough for Tesseract's LSTM engine to read accurately.
/// 2. Try three PSM (page segmentation mode) values and keep the richest result:
///    - PSM 3: fully automatic (default) — good for mixed content screenshots
///    - PSM 6: single uniform text block — good for code, documents, forms
///    - PSM 11: sparse text — good for UI screenshots with scattered labels
/// 3. Use OEM 1 (LSTM-only engine) instead of OEM 3 (legacy+LSTM hybrid).
///    LSTM consistently produces higher accuracy on modern fonts.
/// 4. preserve_interword_spaces=1 preserves word spacing for better readability.
pub fn run_ocr(image_path: &Path, lang: &str) -> Result<String, String> {
    let binary = match find_tesseract_binary() {
        Some(b) => b,
        None => { return Ok(String::new()); }
    };

    // Preprocess: scale up images that are too small for reliable OCR
    let preprocessed = preprocess_for_ocr(image_path);
    let ocr_source = preprocessed.as_deref().unwrap_or(image_path);

    // Run three PSM modes; keep the result with the most words
    let psm_modes = ["3", "6", "11"];
    let mut best_text = String::new();
    let mut best_word_count = 0usize;

    for psm in &psm_modes {
        let out = command_no_window(&binary)
            .arg(ocr_source.to_str().unwrap_or(""))
            .arg("stdout")
            .arg("-l").arg(lang)
            .arg("--psm").arg(psm)
            .arg("--oem").arg("1")               // LSTM engine — best accuracy
            .arg("-c").arg("preserve_interword_spaces=1")
            .arg("-c").arg("tessedit_do_invert=0") // don't invert colors
            .output();

        if let Ok(o) = out {
            if o.status.success() {
                let text = clean_ocr_text(&String::from_utf8_lossy(&o.stdout));
                let wc = text.split_whitespace().count();
                if wc > best_word_count {
                    best_word_count = wc;
                    best_text = text;
                }
            }
        }
    }

    // Clean up temp preprocessing file
    if let Some(ref p) = preprocessed {
        let _ = std::fs::remove_file(p);
    }

    Ok(best_text)
}

/// Scale up images narrower than 1400px so Tesseract can reliably detect
/// characters. Screenshots taken on high-DPI displays are usually ≥1920px
/// and need no scaling. Small crops or mobile screenshots benefit greatly.
/// Returns Some(temp_path) if scaling was applied, None if not needed.
fn preprocess_for_ocr(image_path: &Path) -> Option<std::path::PathBuf> {
    let img = image::open(image_path).ok()?;
    let (w, _h) = img.dimensions();

    // Tesseract works best when the narrowest text is ≥20px tall.
    // 1400px width is a safe floor for most screenshot content.
    let min_width = 1400u32;
    if w >= min_width {
        return None; // no preprocessing needed
    }

    // Scale up (cap at 3× to avoid huge files)
    let scale = (min_width as f32 / w as f32).min(3.0);
    let nw = (w as f32 * scale) as u32;
    let nh = (_h as f32 * scale) as u32;
    let scaled = img.resize(nw, nh, image::imageops::FilterType::Lanczos3);

    // Save adjacent to original with a hidden prefix so it's easy to clean up
    let stem = image_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("img");
    let tmp = image_path.with_file_name(format!(".{}_ocr_pre.png", stem));
    scaled.save(&tmp).ok()?;
    Some(tmp)
}

pub fn is_tesseract_available() -> bool { find_tesseract_binary().is_some() }

pub fn tesseract_version_line(binary: &str) -> Option<String> {
    let out = command_no_window(binary).arg("--version").output().ok()?;
    if !out.status.success() { return None; }
    if let Some(line) = String::from_utf8_lossy(&out.stdout).lines().next() {
        return Some(line.to_string());
    }
    if let Some(line) = String::from_utf8_lossy(&out.stderr).lines().next() {
        return Some(line.to_string());
    }
    None
}

fn clean_ocr_text(text: &str) -> String {
    text.lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty() && l.len() > 1)
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn detect_language(text: &str) -> String {
    if text.trim().is_empty() { return "eng".to_string(); }
    let lower = text.to_lowercase();
    let chars: Vec<char> = lower.chars().collect();
    let total = chars.len() as f64;
    if total == 0.0 { return "eng".to_string(); }
    let cyrillic = chars.iter().filter(|&&c| ('\u{0400}'..='\u{04FF}').contains(&c)).count() as f64;
    let arabic = chars.iter().filter(|&&c| ('\u{0600}'..='\u{06FF}').contains(&c)).count() as f64;
    let cjk = chars.iter().filter(|&&c| ('\u{4E00}'..='\u{9FFF}').contains(&c)).count() as f64;
    if cjk/total > 0.20 { return "chi_sim".to_string(); }
    if arabic/total > 0.15 { return "ara".to_string(); }
    if cyrillic/total > 0.15 { return "rus".to_string(); }
    let turkish_chars = chars.iter().filter(|&&c| matches!(c, 'ş'|'ğ'|'ı'|'ö'|'ü'|'ç'|'â'|'î'|'û')).count() as f64;
    let tr_words = ["ve","bir","bu","da","de","ile","için","var","gibi","olan","daha","çok"];
    let words: Vec<&str> = lower.split_whitespace().collect();
    let total_words = words.len().max(1) as f64;
    let tr_hits = tr_words.iter().map(|w| words.iter().filter(|t| **t == *w).count() as f64).sum::<f64>();
    if turkish_chars/total > 0.015 || tr_hits/total_words > 0.08 { return "tur".to_string(); }
    "eng".to_string()
}

pub fn best_tesseract_lang(detected: &str, user_setting: &str) -> String {
    if user_setting.contains(detected) { return user_setting.to_string(); }
    if detected == "eng" { return "eng".to_string(); }
    format!("{}+eng", detected)
}

pub fn lang_display_name(code: &str) -> &'static str {
    match code {
        "tur" => "Türkçe","eng" => "İngilizce","deu" => "Almanca",
        "fra" => "Fransızca","spa" => "İspanyolca","rus" => "Rusça",
        _ => "Diğer",
    }
}

pub fn generate_thumbnail(image_path: &Path) -> Option<String> {
    let img = image::open(image_path).ok()?;
    let (w, h) = img.dimensions();
    let max = 400u32;
    let (tw, th) = if w > h { (max, (h * max / w).max(1)) } else { ((w * max / h).max(1), max) };
    let thumb = img.resize(tw, th, image::imageops::FilterType::Lanczos3);
    let mut buf = Vec::new();
    thumb.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Jpeg).ok()?;
    Some(format!("data:image/jpeg;base64,{}", base64::engine::general_purpose::STANDARD.encode(&buf)))
}

pub fn save_image_bytes(bytes: &[u8], width: usize, height: usize, path: &Path) -> Result<(), String> {
    let img = image::RgbaImage::from_raw(width as u32, height as u32, bytes.to_vec()).ok_or("Image creation failed")?;
    img.save(path).map_err(|e| format!("Save failed: {}", e))
}
