use crate::models::Screenshot;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::Path;
use base64::Engine;

const WWT_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WwtMeta {
    pub version: u32, pub id: String, pub title: Option<String>, pub description: Option<String>,
    pub category: Option<String>, pub tags: Vec<String>, pub source_hint: Option<String>,
    pub app_info: Option<String>, pub confidence: Option<f64>, pub detected_language: Option<String>,
    pub has_sensitive: bool, pub is_favorite: bool, pub created_at: String, pub exported_at: String,
}

impl WwtMeta {
    pub fn from_screenshot(ss: &Screenshot) -> Self {
        Self {
            version: WWT_VERSION, id: ss.id.clone(), title: ss.title.clone(), description: ss.description.clone(),
            category: ss.category.clone(), tags: ss.tags.clone(), source_hint: ss.source_hint.clone(),
            app_info: ss.app_info.clone(), confidence: ss.confidence, detected_language: ss.detected_language.clone(),
            has_sensitive: ss.has_sensitive, is_favorite: ss.is_favorite,
            created_at: ss.created_at.clone(),
            exported_at: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        }
    }
}

pub fn export_wwt(ss: &Screenshot, out_path: &Path) -> Result<(), String> {
    let image_bytes = std::fs::read(&ss.image_path).map_err(|e| format!("Image read failed: {}", e))?;
    let meta = WwtMeta::from_screenshot(ss);
    let meta_json = serde_json::to_string_pretty(&meta).map_err(|e| format!("JSON error: {}", e))?;
    let file = std::fs::File::create(out_path).map_err(|e| format!("File create failed: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let options: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated).unix_permissions(0o644);
    let ext = std::path::Path::new(&ss.image_path).extension().and_then(|e| e.to_str()).unwrap_or("png");
    zip.start_file(format!("image.{}", ext), options).map_err(|e| format!("ZIP error: {}", e))?;
    zip.write_all(&image_bytes).map_err(|e| format!("ZIP write: {}", e))?;
    if let Some(ref thumb) = ss.image_thumb {
        if let Some(b64) = thumb.split(',').nth(1) {
            if let Ok(thumb_bytes) = base64::engine::general_purpose::STANDARD.decode(b64) {
                zip.start_file("thumb.jpg", options).map_err(|e| format!("ZIP error: {}", e))?;
                zip.write_all(&thumb_bytes).map_err(|e| format!("ZIP write: {}", e))?;
            }
        }
    }
    zip.start_file("meta.json", options).map_err(|e| format!("ZIP error: {}", e))?;
    zip.write_all(meta_json.as_bytes()).map_err(|e| format!("ZIP write: {}", e))?;
    if let Some(ref ocr) = ss.ocr_text {
        if !ocr.is_empty() {
            zip.start_file("ocr.txt", options).map_err(|e| format!("ZIP error: {}", e))?;
            zip.write_all(ocr.as_bytes()).map_err(|e| format!("ZIP write: {}", e))?;
        }
    }
    zip.finish().map_err(|e| format!("ZIP finalize: {}", e))?;
    Ok(())
}

pub fn import_wwt(wwt_path: &Path) -> Result<(WwtMeta, Vec<u8>, Option<String>), String> {
    let file = std::fs::File::open(wwt_path).map_err(|e| format!("Open failed: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("ZIP open failed: {}", e))?;
    let mut meta_json = String::new(); let mut image_data = Vec::new(); let mut ocr_text = None;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("ZIP read: {}", e))?;
        let name = entry.name().to_string();
        if name == "meta.json" { entry.read_to_string(&mut meta_json).map_err(|e| format!("meta.json: {}", e))?; }
        else if name.starts_with("image.") { entry.read_to_end(&mut image_data).map_err(|e| format!("image: {}", e))?; }
        else if name == "ocr.txt" { let mut s = String::new(); entry.read_to_string(&mut s).map_err(|e| format!("ocr.txt: {}", e))?; ocr_text = Some(s); }
    }
    if meta_json.is_empty() { return Err("meta.json not found".into()); }
    if image_data.is_empty() { return Err("image not found".into()); }
    let meta: WwtMeta = serde_json::from_str(&meta_json).map_err(|e| format!("meta.json parse: {}", e))?;
    Ok((meta, image_data, ocr_text))
}

pub fn bulk_export_wwt(screenshots: &[Screenshot], out_dir: &Path) -> Result<usize, String> {
    std::fs::create_dir_all(out_dir).map_err(|e| e.to_string())?;
    let mut count = 0;
    for ss in screenshots {
        let safe_title = ss.title.as_deref().unwrap_or("screenshot").chars().map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' }).take(40).collect::<String>();
        let filename = format!("{}_{}.wwt", &ss.created_at[..10], safe_title);
        if export_wwt(ss, &out_dir.join(&filename)).is_ok() { count += 1; }
    }
    Ok(count)
}
