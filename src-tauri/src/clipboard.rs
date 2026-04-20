use arboard::Clipboard;
use std::time::Duration;

pub struct ClipboardMonitor { last_hash: Option<u64> }

pub struct ImageCapture {
    pub bytes: Vec<u8>,
    pub width: usize,
    pub height: usize,
    pub app_name: Option<String>,
    pub source: CaptureSource,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CaptureSource {
    Clipboard,
    ScreenshotsFolder,
}

impl ClipboardMonitor {
    pub fn new() -> Self { Self { last_hash: None } }

    pub fn poll(&mut self) -> Option<ImageCapture> {
        let app_name = crate::app_info::get_foreground_app();
        let mut clipboard = Clipboard::new().ok()?;
        match clipboard.get_image() {
            Ok(img) => {
                let hash = fast_hash(&img.bytes);
                if self.last_hash == Some(hash) { return None; }
                self.last_hash = Some(hash);
                Some(ImageCapture {
                    bytes: img.bytes.into_owned(),
                    width: img.width,
                    height: img.height,
                    app_name,
                    source: CaptureSource::Clipboard,
                })
            }
            Err(_) => None,
        }
    }
}

// FIX: replaced std::collections::hash_map::DefaultHasher with FNV-1a.
// DefaultHasher's output is explicitly not stable across Rust versions
// (per the stdlib docs). If this hash is ever persisted or compared across
// process restarts it could silently mismatch.
// FNV-1a is deterministic, platform-independent, and ~same speed for small inputs.
fn fast_hash(data: &[u8]) -> u64 {
    const FNV_OFFSET: u64 = 14695981039346656037;
    const FNV_PRIME: u64 = 1099511628211;

    let sample = 4096usize;
    let mut hasher = FNV_OFFSET;

    // Sample leading bytes
    let end = data.len().min(sample);
    for &b in &data[..end] {
        hasher ^= b as u64;
        hasher = hasher.wrapping_mul(FNV_PRIME);
    }

    // Sample trailing bytes (if image is large enough to skip the middle)
    if data.len() > sample * 2 {
        let start = data.len() - sample;
        for &b in &data[start..] {
            hasher ^= b as u64;
            hasher = hasher.wrapping_mul(FNV_PRIME);
        }
        // Mix in total length so two different-sized images with same leading/trailing
        // bytes don't collide
        for &b in &(data.len() as u64).to_ne_bytes() {
            hasher ^= b as u64;
            hasher = hasher.wrapping_mul(FNV_PRIME);
        }
    }

    hasher
}

#[cfg(target_os = "windows")]
fn windows_screenshots_folder() -> Option<std::path::PathBuf> {
    let profile = std::env::var("USERPROFILE").ok()?;
    let path = std::path::Path::new(&profile).join("Pictures").join("Screenshots");
    if path.exists() { Some(path) } else { None }
}

#[cfg(target_os = "windows")]
fn poll_screenshots_folder(known: &mut std::collections::HashSet<String>) -> Vec<std::path::PathBuf> {
    let Some(folder) = windows_screenshots_folder() else { return vec![]; };
    let cutoff = std::time::SystemTime::now()
        .checked_sub(Duration::from_secs(10))
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);

    let mut new_files = Vec::new();
    let Ok(entries) = std::fs::read_dir(&folder) else { return vec![]; };

    for entry in entries.flatten() {
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if ext != "png" && ext != "jpg" && ext != "jpeg" { continue; }

        let key = path.to_string_lossy().to_string();
        if known.contains(&key) { continue; }

        let Ok(meta) = std::fs::metadata(&path) else { continue; };
        let Ok(modified) = meta.modified() else { continue; };
        if modified >= cutoff {
            known.insert(key);
            new_files.push(path);
        } else {
            known.insert(key);
        }
    }
    new_files
}

pub fn start_monitoring<F>(interval_ms: u64, mut callback: F)
where
    F: FnMut(ImageCapture) + Send + 'static,
{
    std::thread::spawn(move || {
        let mut monitor = ClipboardMonitor::new();
        let interval = Duration::from_millis(interval_ms);

        #[cfg(target_os = "windows")]
        let mut known_files: std::collections::HashSet<String> = {
            let mut set = std::collections::HashSet::new();
            if let Some(folder) = windows_screenshots_folder() {
                if let Ok(entries) = std::fs::read_dir(&folder) {
                    for entry in entries.flatten() {
                        set.insert(entry.path().to_string_lossy().to_string());
                    }
                }
            }
            set
        };

        loop {
            if let Some(capture) = monitor.poll() {
                callback(capture);
            }

            #[cfg(target_os = "windows")]
            {
                for path in poll_screenshots_folder(&mut known_files) {
                    match image::open(&path) {
                        Ok(img) => {
                            use image::GenericImageView;
                            let rgba = img.to_rgba8();
                            let (w, h) = img.dimensions();
                            callback(ImageCapture {
                                bytes: rgba.into_raw(),
                                width: w as usize,
                                height: h as usize,
                                app_name: None,
                                source: CaptureSource::ScreenshotsFolder,
                            });
                        }
                        Err(e) => log::warn!("Could not load screenshot from folder: {}", e),
                    }
                }
            }

            std::thread::sleep(interval);
        }
    });
}
