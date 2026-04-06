use arboard::Clipboard;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
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

fn fast_hash(data: &[u8]) -> u64 {
    let mut h = DefaultHasher::new();
    let sample = 4096usize;
    if data.len() > sample * 2 {
        data[..sample].hash(&mut h);
        data[data.len() - sample..].hash(&mut h);
        data.len().hash(&mut h);
    } else {
        data.hash(&mut h);
    }
    h.finish()
}

/// Returns the Windows Screenshots folder path:
/// `%USERPROFILE%\Pictures\Screenshots`
#[cfg(target_os = "windows")]
fn windows_screenshots_folder() -> Option<std::path::PathBuf> {
    let profile = std::env::var("USERPROFILE").ok()?;
    let path = std::path::Path::new(&profile).join("Pictures").join("Screenshots");
    if path.exists() { Some(path) } else { None }
}

/// Watches the Windows Screenshots folder for new image files created recently.
/// Returns a list of new file paths added since the last check.
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

        // Only pick up files modified within the last 10 seconds
        let Ok(meta) = std::fs::metadata(&path) else { continue; };
        let Ok(modified) = meta.modified() else { continue; };
        if modified >= cutoff {
            known.insert(key);
            new_files.push(path);
        } else {
            // Still register so we don't re-check it
            known.insert(key);
        }
    }
    new_files
}

/// Starts clipboard monitoring and (on Windows) Screenshots folder monitoring.
/// Calls `callback` for each new capture detected.
pub fn start_monitoring<F>(interval_ms: u64, mut callback: F)
where
    F: FnMut(ImageCapture) + Send + 'static,
{
    std::thread::spawn(move || {
        let mut monitor = ClipboardMonitor::new();
        let interval = Duration::from_millis(interval_ms);

        #[cfg(target_os = "windows")]
        let mut known_files: std::collections::HashSet<String> = {
            // Pre-populate with existing files so we don't import old screenshots on startup
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
            // Clipboard-based capture (Win+Shift+S)
            if let Some(capture) = monitor.poll() {
                callback(capture);
            }

            // Windows PrintScreen folder watcher
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
