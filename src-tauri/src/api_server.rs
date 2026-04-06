use crate::database::Database;
use crate::models::Screenshot;
use crate::ocr::generate_thumbnail;
use crate::phash;
use base64::Engine;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::Manager;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

const PORT: u16 = 27484;
// FIX: align with Cargo.toml version
const VERSION: &str = "1.0.0";
const BASE_CORS: &str = "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization, X-API-Key\r\nVary: Origin\r\n";

fn limiter() -> &'static Mutex<HashMap<String, (Instant, u32)>> {
    static STORE: OnceLock<Mutex<HashMap<String, (Instant, u32)>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn hit_rate_limit(key: &str, limit_per_min: u32) -> bool {
    if limit_per_min == 0 { return true; }
    let now = Instant::now(); let mut guard = limiter().lock().ok();
    let Some(map) = guard.as_mut() else { return false; };
    let entry = map.entry(key.to_string()).or_insert((now, 0));
    if now.duration_since(entry.0) > Duration::from_secs(60) { *entry = (now, 1); return false; }
    entry.1 += 1; entry.1 > limit_per_min
}

fn wildcard_match(pattern: &str, value: &str) -> bool {
    if pattern == "*" { return true; }
    if let Some(pos) = pattern.find('*') { let (head, tail) = pattern.split_at(pos); let tail = &tail[1..]; value.starts_with(head) && value.ends_with(tail) } else { pattern == value }
}

fn is_origin_allowed(origin: Option<&str>, allowlist: &[String]) -> bool {
    let Some(origin) = origin else { return true; };
    allowlist.iter().any(|pat| wildcard_match(pat, origin))
}

fn cors_headers(origin: Option<&str>, allowlist: &[String]) -> String {
    match origin {
        Some(o) if is_origin_allowed(Some(o), allowlist) => format!("Access-Control-Allow-Origin: {}\r\n{}", o, BASE_CORS),
        _ => String::new(),
    }
}

fn extract_api_key(headers: &HashMap<String, String>) -> Option<String> {
    if let Some(v) = headers.get("x-api-key") { return Some(v.trim().to_string()); }
    if let Some(v) = headers.get("authorization") { if v.to_lowercase().starts_with("bearer ") { return Some(v[7..].trim().to_string()); } }
    None
}

fn is_authorized(headers: &HashMap<String, String>, expected_token: &str) -> bool {
    if expected_token.trim().is_empty() { return false; }
    extract_api_key(headers).map(|k| k == expected_token).unwrap_or(false)
}

pub async fn start_api_server(db: Arc<Database>, images_dir: PathBuf, app_handle: tauri::AppHandle) {
    { let mut s = db.load_settings(); if s.local_api_token.trim().is_empty() { s.local_api_token = uuid::Uuid::new_v4().to_string(); let _ = db.save_settings(&s); log::warn!("Generated new local API token"); } }
    let addr = format!("127.0.0.1:{}", PORT);
    let listener = match TcpListener::bind(&addr).await { Ok(l) => { log::info!("Extension API server listening on {}", addr); l } Err(e) => { log::warn!("API server bind failed: {}", e); return; } };
    loop {
        let Ok((stream, _)) = listener.accept().await else { continue; };
        let db_c = db.clone(); let dir_c = images_dir.clone(); let app_c = app_handle.clone();
        tauri::async_runtime::spawn(async move { if let Err(e) = handle_connection(stream, db_c, dir_c, app_c).await { log::debug!("API connection error: {}", e); } });
    }
}

async fn handle_connection(mut stream: tokio::net::TcpStream, db: Arc<Database>, images_dir: PathBuf, app_handle: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let peer_key = stream.peer_addr().map(|a| a.ip().to_string()).unwrap_or_else(|_| "local".to_string());
    let settings = db.load_settings();
    let mut reader = BufReader::new(&mut stream);
    let mut req_line = String::new(); reader.read_line(&mut req_line).await?;
    let req_line = req_line.trim().to_string();
    let parts: Vec<&str> = req_line.splitn(3, ' ').collect();
    if parts.len() < 2 { return Ok(()); }
    let method = parts[0]; let path = parts[1].split('?').next().unwrap_or(parts[1]);
    let mut headers: HashMap<String, String> = HashMap::new(); let mut content_length: usize = 0;
    loop {
        let mut line = String::new(); reader.read_line(&mut line).await?;
        let line = line.trim().to_string(); if line.is_empty() { break; }
        if let Some((k, v)) = line.split_once(':') { let key = k.trim().to_lowercase(); let val = v.trim().to_string(); if key == "content-length" { content_length = val.parse().unwrap_or(0); } headers.insert(key, val); }
    }
    let origin = headers.get("origin").map(|s| s.as_str());
    let cors = cors_headers(origin, &settings.local_api_allowed_origins);
    if method == "OPTIONS" { if !is_origin_allowed(origin, &settings.local_api_allowed_origins) { write_json(&mut stream, 403, r#"{"error":"Origin not allowed"}"#, "").await?; } else { write_json(&mut stream, 204, "", &cors).await?; } stream.flush().await?; return Ok(()); }
    if path != "/api/ping" {
        if !is_origin_allowed(origin, &settings.local_api_allowed_origins) { write_json(&mut stream, 403, r#"{"error":"Origin not allowed"}"#, &cors).await?; stream.flush().await?; return Ok(()); }
        if !is_authorized(&headers, &settings.local_api_token) { write_json(&mut stream, 401, r#"{"error":"Unauthorized"}"#, &cors).await?; stream.flush().await?; return Ok(()); }
        if hit_rate_limit(&peer_key, settings.local_api_rate_limit_per_min) { write_json(&mut stream, 429, r#"{"error":"Rate limit exceeded"}"#, &cors).await?; stream.flush().await?; return Ok(()); }
    }
    match (method, path) {
        ("GET" | "HEAD", "/api/ping") => { let body = format!(r#"{{"ok":true,"app":"WhatWasThat","version":"{}"}}"#, VERSION); write_json(&mut stream, 200, &body, &cors).await?; }
        ("POST", "/api/ingest") => {
            let cap = content_length.min(25_000_000); let mut body_bytes = vec![0u8; cap];
            if cap > 0 { reader.read_exact(&mut body_bytes).await.unwrap_or_default(); }
            let body_str = String::from_utf8_lossy(&body_bytes);
            match handle_ingest(&db, &images_dir, &app_handle, &body_str).await {
                Ok(ss) => { let resp = format!(r#"{{"ok":true,"id":"{}","title":{}}}"#, ss.id, ss.title.as_deref().map(|t| format!("\"{}\"", t.replace('"', "\\\""))).unwrap_or("null".into())); write_json(&mut stream, 200, &resp, &cors).await?; }
                Err(e) => { let resp = format!(r#"{{"ok":false,"error":"{}"}}"#, e.replace('"', "'")); write_json(&mut stream, 500, &resp, &cors).await?; }
            }
        }
        _ => { write_json(&mut stream, 404, r#"{"error":"Not found"}"#, &cors).await?; }
    }
    stream.flush().await?; Ok(())
}

async fn handle_ingest(db: &Arc<Database>, images_dir: &PathBuf, app_handle: &tauri::AppHandle, body: &str) -> Result<Screenshot, String> {
    let payload: serde_json::Value = serde_json::from_str(body).map_err(|e| format!("JSON parse: {}", e))?;
    let data_url = payload["data_url"].as_str().ok_or("data_url missing")?;
    let b64_data = data_url.split(',').nth(1).ok_or("Invalid data URL")?;
    let image_bytes = base64::engine::general_purpose::STANDARD.decode(b64_data).map_err(|e| format!("Base64 decode: {}", e))?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now(); let ts = now.format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let filename = format!("{}_ext.png", now.format("%Y%m%d_%H%M%S_%3f"));
    let img_path = images_dir.join(&filename);
    std::fs::write(&img_path, &image_bytes).map_err(|e| format!("Save failed: {}", e))?;
    let thumb = generate_thumbnail(&img_path);
    let phash_val = phash::compute_phash(&img_path).map(|h| phash::hash_to_hex(h));
    let url = payload["url"].as_str().unwrap_or("").to_string();
    let title = payload["title"].as_str().map(String::from);
    let sel = payload["selection_text"].as_str().map(String::from);
    let ss = Screenshot { id: id.clone(), timestamp: ts.clone(), image_path: img_path.to_string_lossy().to_string(), image_thumb: thumb, ocr_text: sel.clone(), ocr_masked: None, has_sensitive: false, title: title.or_else(|| Some(extract_domain(&url))), description: None, category: None, tags: vec![], source_hint: Some(extract_domain(&url)), app_info: Some("Browser Extension".into()), confidence: None, detected_language: None, phash: phash_val, is_favorite: false, is_archived: false, status: "pending".to_string(), error_msg: None, created_at: ts };
    db.insert_screenshot(&ss).map_err(|e| e.to_string())?;
    app_handle.emit_all("screenshot:new", &ss).unwrap_or_default();
    let settings = db.load_settings();
    if settings.auto_process { let db_c = db.clone(); let ss_c = ss.clone(); let app_c = app_handle.clone(); tauri::async_runtime::spawn(async move { let updated = crate::queue::process_one(ss_c, &settings, &db_c).await; app_c.emit_all("screenshot:done", &updated).unwrap_or_default(); }); }
    Ok(ss)
}

fn extract_domain(url: &str) -> String { url.split("//").nth(1).and_then(|h| h.split('/').next()).and_then(|h| h.split(':').next()).unwrap_or(url).trim_start_matches("www.").to_string() }

async fn write_json(stream: &mut tokio::net::TcpStream, status: u16, body: &str, cors: &str) -> std::io::Result<()> {
    let status_line = match status { 200 => "HTTP/1.1 200 OK", 204 => "HTTP/1.1 204 No Content", 401 => "HTTP/1.1 401 Unauthorized", 403 => "HTTP/1.1 403 Forbidden", 404 => "HTTP/1.1 404 Not Found", 429 => "HTTP/1.1 429 Too Many Requests", _ => "HTTP/1.1 500 Internal Server Error" };
    let resp = format!("{status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{}Connection: close\r\n\r\n{}", body.len(), cors, body);
    stream.write_all(resp.as_bytes()).await
}
