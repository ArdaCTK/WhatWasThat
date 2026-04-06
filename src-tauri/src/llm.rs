use crate::models::{AppSettings, LlmAnalysis};
use base64::Engine;
use image::GenericImageView;
use reqwest::Client;
use serde_json::{json, Value};
use std::io::Cursor;
use std::path::Path;
use std::time::Duration;

fn build_system_prompt(ui_language: &str) -> String {
    let lang_instruction = if ui_language.trim().eq_ignore_ascii_case("tr") {
        "\"title\" ve \"description\" alanlarını Türkçe yaz."
    } else {
        "Write \"title\" and \"description\" in English."
    };

    format!(
        r#"You are an intelligent screenshot analyzer. Analyze the screenshot and return ONLY a JSON object:
- "title": Short descriptive title (max 60 chars)
- "description": Brief description (max 200 chars)
- "category": MUST be exactly ONE of these values: Music, Film/TV, Code/Tech, News, Shopping, Food, Travel, Gaming, Books, Social Media, Work, Education, Other
- "tags": Array of 3-6 relevant lowercase tags
- "source_hint": App or website name if detectable, otherwise null
- "confidence": Float 0.0-1.0
Language instruction: {}"#,
        lang_instruction
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Image helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Read and resize the image to max_px on the longest side, then encode as
/// JPEG base64. Returns (mime_type, base64_string).
/// Resizing before sending reduces request size significantly (a full 1920×1080
/// PNG is ~2 MB; the same image resized to 1280px JPEG is ~150 KB).
fn read_image_base64_resized(path: &Path, max_px: u32) -> Option<(String, String)> {
    let img = image::open(path).ok()?;
    let (w, h) = img.dimensions();

    let resized = if w > max_px || h > max_px {
        img.thumbnail(max_px, max_px)
    } else {
        img
    };

    let mut buf = Vec::new();
    resized
        .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Jpeg)
        .ok()?;

    Some((
        "image/jpeg".to_string(),
        base64::engine::general_purpose::STANDARD.encode(&buf),
    ))
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/// Analyze a screenshot with the configured LLM.
///
/// **Vision mode** (when `settings.llm_use_vision = true` AND image_path exists):
/// - OpenAI: sends image via the vision API (gpt-4o, gpt-4o-mini, etc.)
/// - Ollama: sends image via the `images` field (llava, llava-phi3, etc.)
///
/// If vision fails with a model-capability error, falls back to text-only
/// automatically so misconfigured text-only models don't break processing.
///
/// **Text-only mode** (when vision is disabled or unavailable):
/// Sends the OCR-extracted text exactly as before.
///
/// **Which is better?**
/// OCR+Image is significantly better:
/// - Sees UI elements, logos, icons OCR misses entirely
/// - Can read text that OCR garbled or skipped
/// - Understands layout context (code editor vs browser vs spreadsheet)
/// - Works on screenshots with no text at all (images, charts)
pub async fn analyze_screenshot(
    settings: &AppSettings,
    ocr_text: &str,
    image_path: Option<&Path>,
    detected_lang: Option<&str>,
) -> Result<LlmAnalysis, String> {
    let image_available = settings.llm_use_vision
        && image_path.map(|p| p.exists()).unwrap_or(false);

    match settings.llm_provider.as_str() {
        "openai" => {
            if settings.openai_api_key.is_empty() {
                return Err("OpenAI API key is not configured".into());
            }
            if image_available {
                let path = image_path.unwrap();
                match analyze_openai_vision(settings, ocr_text, path, detected_lang).await {
                    Ok(r) => return Ok(r),
                    Err(e) => {
                        // Fall back to text-only for models that don't support vision
                        if is_vision_unsupported_error(&e) {
                            log::warn!("OpenAI vision not supported by model, falling back to text-only: {}", e);
                        } else {
                            return Err(e);
                        }
                    }
                }
            }
            analyze_openai_text(settings, ocr_text, detected_lang).await
        }
        "ollama" => {
            if image_available {
                let path = image_path.unwrap();
                match analyze_ollama_vision(settings, ocr_text, path, detected_lang).await {
                    Ok(r) => return Ok(r),
                    Err(e) => {
                        if is_vision_unsupported_error(&e) {
                            log::warn!("Ollama model does not support vision, falling back to text-only: {}", e);
                        } else {
                            return Err(e);
                        }
                    }
                }
            }
            analyze_ollama_text(settings, ocr_text, detected_lang).await
        }
        _ => Err("LLM provider not configured".into()),
    }
}

fn is_vision_unsupported_error(e: &str) -> bool {
    let lower = e.to_lowercase();
    lower.contains("vision")
        || lower.contains("image")
        || lower.contains("multimodal")
        || lower.contains("does not support")
        || lower.contains("invalid_request")
        || lower.contains("model_not_found")
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI — vision
// ─────────────────────────────────────────────────────────────────────────────

async fn analyze_openai_vision(
    settings: &AppSettings,
    ocr_text: &str,
    image_path: &Path,
    lang: Option<&str>,
) -> Result<LlmAnalysis, String> {
    let (mime, b64) = read_image_base64_resized(image_path, 1280)
        .ok_or_else(|| "vision: could not read/resize image".to_string())?;

    let data_url = format!("data:{};base64,{}", mime, b64);

    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let lang_hint = lang.map(|l| format!("\n[Detected language: {}]", l)).unwrap_or_default();
    let text_part = if ocr_text.trim().is_empty() {
        "No OCR text available — analyze the screenshot visually.".to_string()
    } else {
        format!("OCR text:{}\n\n{}", lang_hint, ocr_text)
    };

    let system_prompt = build_system_prompt(&settings.ui_language);
    // "detail: low" makes OpenAI resize to 512×512 internally — cheap and fast
    let body = json!({
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": data_url, "detail": "low"}},
                {"type": "text", "text": text_part}
            ]}
        ],
        "max_tokens": 600,
        "temperature": 0.2,
        "response_format": {"type": "json_object"}
    });

    let resp = client
        .post(format!("{}/chat/completions", settings.openai_base_url))
        .header("Authorization", format!("Bearer {}", settings.openai_api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI request error: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("OpenAI error {}: {}", status, &text[..text.len().min(300)]));
    }

    let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    parse_llm_response(
        json["choices"][0]["message"]["content"]
            .as_str()
            .ok_or("Empty response from OpenAI")?,
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI — text-only
// ─────────────────────────────────────────────────────────────────────────────

async fn analyze_openai_text(
    settings: &AppSettings,
    ocr_text: &str,
    lang: Option<&str>,
) -> Result<LlmAnalysis, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let lang_hint = lang.map(|l| format!("\n[Detected language: {}]", l)).unwrap_or_default();
    let user_msg = if ocr_text.trim().is_empty() {
        "No OCR text available. Categorize as Other.".to_string()
    } else {
        format!("OCR text:{}\n\n{}", lang_hint, ocr_text)
    };

    let system_prompt = build_system_prompt(&settings.ui_language);
    let body = json!({
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg}
        ],
        "max_tokens": 500,
        "temperature": 0.2,
        "response_format": {"type": "json_object"}
    });

    let resp = client
        .post(format!("{}/chat/completions", settings.openai_base_url))
        .header("Authorization", format!("Bearer {}", settings.openai_api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI request error: {}", e))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("OpenAI error {}: {}", status, &text[..text.len().min(200)]));
    }

    let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    parse_llm_response(
        json["choices"][0]["message"]["content"]
            .as_str()
            .ok_or("Empty response from OpenAI")?,
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Ollama — vision
// ─────────────────────────────────────────────────────────────────────────────

async fn analyze_ollama_vision(
    settings: &AppSettings,
    ocr_text: &str,
    image_path: &Path,
    lang: Option<&str>,
) -> Result<LlmAnalysis, String> {
    let (_, image_b64) = read_image_base64_resized(image_path, 1280)
        .ok_or_else(|| "vision: could not read/resize image".to_string())?;

    let ollama_url = settings.ollama_url.trim_end_matches('/');
    let endpoint = format!("{}/api/generate", ollama_url);

    // Vision (llava) runs slower locally — give it more time
    let client = Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;

    let lang_hint = lang.map(|l| format!("\n[Detected language: {}]", l)).unwrap_or_default();
    let system_prompt = build_system_prompt(&settings.ui_language);
    let text_part = if ocr_text.trim().is_empty() {
        "Analyze this screenshot visually.".to_string()
    } else {
        format!("OCR text:{}\n{}", lang_hint, ocr_text)
    };
    let prompt = format!("{}\n\n{}", system_prompt, text_part);

    let body = json!({
        "model": settings.ollama_model,
        "prompt": prompt,
        "images": [image_b64],
        "stream": false,
        "format": "json",
        "options": {"temperature": 0.2, "num_predict": 600}
    });

    let mut last_err = String::new();
    for attempt in 0..3u8 {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
        match client.post(&endpoint).json(&body).send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    let s = resp.status();
                    let t = resp.text().await.unwrap_or_default();
                    return Err(format!("Ollama HTTP {} (vision not supported by model?): {}", s, &t[..t.len().min(150)]));
                }
                let text = resp.text().await.map_err(|e| e.to_string())?;
                let json: Value = serde_json::from_str(&text)
                    .map_err(|e| format!("Ollama JSON parse error: {}", e))?;
                return parse_llm_response(
                    json["response"].as_str().ok_or("Empty response from Ollama")?,
                );
            }
            Err(e) if e.is_connect() || e.is_timeout() => {
                last_err = format!(
                    "Cannot connect to Ollama at '{}'. Is Ollama running? Try: ollama serve",
                    ollama_url
                );
            }
            Err(e) => return Err(format!("Ollama request error: {}", e)),
        }
    }
    Err(last_err)
}

// ─────────────────────────────────────────────────────────────────────────────
// Ollama — text-only
// ─────────────────────────────────────────────────────────────────────────────

async fn analyze_ollama_text(
    settings: &AppSettings,
    ocr_text: &str,
    lang: Option<&str>,
) -> Result<LlmAnalysis, String> {
    let ollama_url = settings.ollama_url.trim_end_matches('/');
    let endpoint = format!("{}/api/generate", ollama_url);

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let lang_hint = lang.map(|l| format!("\n[Detected language: {}]", l)).unwrap_or_default();
    let system_prompt = build_system_prompt(&settings.ui_language);
    let prompt = format!("{}\n\nOCR text:{}\n{}", system_prompt, lang_hint, ocr_text);

    let body = json!({
        "model": settings.ollama_model,
        "prompt": prompt,
        "stream": false,
        "format": "json",
        "options": {"temperature": 0.2, "num_predict": 500}
    });

    let mut last_err = String::new();
    for attempt in 0..3u8 {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
        match client.post(&endpoint).json(&body).send().await {
            Ok(resp) => {
                if !resp.status().is_success() {
                    return Err(format!("Ollama HTTP {}", resp.status()));
                }
                let text = resp.text().await.map_err(|e| e.to_string())?;
                let json: Value = serde_json::from_str(&text)
                    .map_err(|e| format!("Ollama JSON parse error: {}", e))?;
                return parse_llm_response(
                    json["response"].as_str().ok_or("Empty response from Ollama")?,
                );
            }
            Err(e) if e.is_connect() || e.is_timeout() => {
                last_err = format!(
                    "Cannot connect to Ollama at '{}'. Is it running? Try: ollama serve",
                    ollama_url
                );
            }
            Err(e) => return Err(format!("Ollama request error: {}", e)),
        }
    }
    Err(last_err)
}

// ─────────────────────────────────────────────────────────────────────────────
// Response parser (shared)
// ─────────────────────────────────────────────────────────────────────────────

pub fn parse_llm_response(content: &str) -> Result<LlmAnalysis, String> {
    let clean = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let json: Value = serde_json::from_str(clean).map_err(|e| {
        format!("JSON parse error: {} | Raw: {}", e, &clean[..clean.len().min(150)])
    })?;

    let confidence = json["confidence"]
        .as_f64()
        .or_else(|| json["confidence"].as_str().and_then(|s| s.parse().ok()))
        .unwrap_or(0.5)
        .clamp(0.0, 1.0);

    let tags: Vec<String> = json["tags"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.to_lowercase().trim().to_string())
                .filter(|s| !s.is_empty())
                .take(8)
                .collect()
        })
        .unwrap_or_default();

    Ok(LlmAnalysis {
        title: json["title"].as_str().unwrap_or("Untitled Screenshot").to_string(),
        description: json["description"].as_str().unwrap_or("").to_string(),
        category: json["category"].as_str().unwrap_or("Other").to_string(),
        tags,
        source_hint: json["source_hint"].as_str().map(String::from),
        confidence,
    })
}
