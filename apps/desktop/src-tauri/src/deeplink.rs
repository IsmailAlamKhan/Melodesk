//! `melodesk://` links and music.youtube.com URLs handed to the app (second instance, Dock,
//! browser). The URL is forwarded to the UI, which decides what to open; nothing is navigated
//! here, so a hostile link can at most open a page in our own UI.

use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_deep_link::DeepLinkExt;

use crate::player::MAIN_LABEL;

pub const EVENT: &str = "app:open-url";

pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    // Dev builds are not installed, so register the scheme at runtime where the OS allows it.
    #[cfg(any(target_os = "linux", windows))]
    let _ = app.deep_link().register_all();

    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        let urls: Vec<String> = event
            .urls()
            .iter()
            .map(|u| u.to_string())
            .filter(|u| is_allowed(u))
            .collect();
        if urls.is_empty() {
            return;
        }
        crate::native::show_main(&handle);
        let _ = handle.emit_to(MAIN_LABEL, EVENT, urls);
    });
    Ok(())
}

/// Only our own scheme and YouTube Music / YouTube watch links are forwarded.
pub fn is_allowed(url: &str) -> bool {
    match url::Url::parse(url) {
        Ok(u) => match u.scheme() {
            "melodesk" => true,
            "https" => matches!(
                u.host_str(),
                Some("music.youtube.com")
                    | Some("www.youtube.com")
                    | Some("youtube.com")
                    | Some("youtu.be")
            ),
            _ => false,
        },
        Err(_) => false,
    }
}

/// Called by the single-instance plugin with the second instance's argv.
pub fn handle_argv<R: Runtime>(app: &AppHandle<R>, argv: &[String]) {
    let urls: Vec<String> = argv.iter().filter(|a| is_allowed(a)).cloned().collect();
    crate::native::show_main(app);
    if !urls.is_empty() {
        let _ = app.emit_to(MAIN_LABEL, EVENT, urls);
    }
}

#[cfg(test)]
mod tests {
    use super::is_allowed;

    #[test]
    fn allows_own_scheme_and_youtube_music_only() {
        assert!(is_allowed("melodesk://watch?v=abc"));
        assert!(is_allowed("https://music.youtube.com/watch?v=abc"));
        assert!(is_allowed("https://youtu.be/abc"));
        assert!(!is_allowed("https://evil.example/watch?v=abc"));
        assert!(!is_allowed("http://music.youtube.com/watch?v=abc"));
        assert!(!is_allowed("javascript:alert(1)"));
        assert!(!is_allowed("not a url"));
    }
}
