pub fn get_foreground_app() -> Option<String> {
    #[cfg(target_os = "windows")]
    return get_foreground_app_windows();
    #[cfg(target_os = "macos")]
    return get_foreground_app_macos();
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    return get_foreground_app_linux();
}

#[cfg(target_os = "windows")]
fn get_foreground_app_windows() -> Option<String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    use windows::core::PWSTR;
    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0 == 0 { return None; }
        let mut pid: u32 = 0;
        windows::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 { return None; }
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = vec![0u16; 260];
        let mut size = buf.len() as u32;
        let pwstr = PWSTR(buf.as_mut_ptr());
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, pwstr, &mut size);
        let _ = windows::Win32::Foundation::CloseHandle(handle);
        if ok.is_err() || size == 0 { return None; }
        let path = String::from_utf16_lossy(&buf[..size as usize]);
        Some(std::path::Path::new(&path).file_name().and_then(|n| n.to_str()).unwrap_or(&path).to_lowercase())
    }
}
#[cfg(target_os = "macos")]
fn get_foreground_app_macos() -> Option<String> {
    let output = std::process::Command::new("osascript").arg("-e")
        .arg("tell application \"System Events\" to get name of first application process whose frontmost is true")
        .output().ok()?;
    if output.status.success() {
        let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !name.is_empty() { return Some(name); }
    }
    None
}
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn get_foreground_app_linux() -> Option<String> {
    let output = std::process::Command::new("xdotool").args(["getactivewindow", "getwindowname"]).output().ok()?;
    if output.status.success() {
        let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !name.is_empty() { return Some(name); }
    }
    None
}

pub fn normalize_app_name(raw: &str) -> String {
    std::path::Path::new(raw).file_name().and_then(|n| n.to_str()).unwrap_or(raw).to_lowercase()
}
pub fn app_display_name(exe: &str) -> &'static str {
    let lower = exe.to_lowercase();
    if lower.contains("chrome") { return "Google Chrome"; }
    if lower.contains("firefox") { return "Firefox"; }
    if lower.contains("msedge") || lower.contains("edge") { return "Microsoft Edge"; }
    if lower.contains("code") { return "VS Code"; }
    if lower.contains("spotify") { return "Spotify"; }
    if lower.contains("discord") { return "Discord"; }
    if lower.contains("slack") { return "Slack"; }
    if lower.contains("teams") { return "Microsoft Teams"; }
    if lower.contains("telegram") { return "Telegram"; }
    if lower.contains("figma") { return "Figma"; }
    if lower.contains("obsidian") { return "Obsidian"; }
    ""
}
pub fn is_app_excluded(app_name: &str, excluded_apps: &[String]) -> bool {
    if app_name.is_empty() || excluded_apps.is_empty() { return false; }
    let lower = app_name.to_lowercase();
    excluded_apps.iter().any(|e| { let e = e.trim().to_lowercase(); !e.is_empty() && (lower.contains(&e) || e.contains(&lower)) })
}
pub fn suggested_exclusions() -> Vec<&'static str> {
    vec!["keepass","1password","bitwarden","lastpass","dashlane","banking"]
}
