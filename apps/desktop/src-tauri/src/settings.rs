//! User settings shared by the Rust shell and the UI, persisted with tauri-plugin-store in
//! `settings.json` inside the app's data directory. Nothing here is telemetry.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "settings.json";
const KEY: &str = "settings";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Shortcuts {
    pub play_pause: Option<String>,
    pub next: Option<String>,
    pub previous: Option<String>,
    pub volume_up: Option<String>,
    pub volume_down: Option<String>,
    pub mute: Option<String>,
    pub show_hide: Option<String>,
}

/// Global shortcuts work in every app, so there are none by default: anything we picked would take
/// a combination somebody types with. Media keys already control playback without any of this.
impl Default for Shortcuts {
    fn default() -> Self {
        Self {
            play_pause: None,
            next: None,
            previous: None,
            volume_up: None,
            volume_down: None,
            mute: None,
            show_hide: None,
        }
    }
}

impl Shortcuts {
    /// The defaults of earlier versions. Cmd/Ctrl+Shift+Left/Right select text in nearly every
    /// text field, and as global shortcuts they stole that selection from every app.
    fn is_legacy_default(&self) -> bool {
        self.play_pause.as_deref() == Some("CommandOrControl+Shift+Space")
            && self.next.as_deref() == Some("CommandOrControl+Shift+Right")
            && self.previous.as_deref() == Some("CommandOrControl+Shift+Left")
            && self.volume_up.is_none()
            && self.volume_down.is_none()
            && self.mute.is_none()
            && self.show_hide.is_none()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Closing the main window hides it (the tray keeps playback going) instead of quitting.
    pub close_to_tray: bool,
    pub launch_at_login: bool,
    /// Show an OS notification when the track changes while the window is not focused.
    pub notify_on_track_change: bool,
    pub shortcuts: Shortcuts,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            close_to_tray: true,
            launch_at_login: false,
            notify_on_track_change: cfg!(windows),
            shortcuts: Shortcuts::default(),
        }
    }
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> Settings {
    let mut settings: Settings = app
        .store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(KEY))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    if settings.shortcuts.is_legacy_default() {
        // Saved by an earlier version that registered these for everyone; clear them for good.
        settings.shortcuts = Shortcuts::default();
        if let Err(e) = save(app, &settings) {
            eprintln!("[settings] could not clear legacy shortcuts: {e}");
        }
    }
    settings
}

pub fn save<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> anyhow::Result<()> {
    let store = app.store(STORE_FILE)?;
    store.set(KEY, serde_json::to_value(settings)?);
    store.save()?;
    Ok(())
}

/// Managed copy so window-close and tray handlers don't hit the disk.
pub struct SettingsState(pub std::sync::Mutex<Settings>);

pub fn current<R: Runtime>(app: &AppHandle<R>) -> Settings {
    app.state::<SettingsState>()
        .0
        .lock()
        .map(|s| s.clone())
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_settings<R: Runtime>(app: AppHandle<R>) -> Settings {
    current(&app)
}

#[tauri::command]
pub fn set_settings<R: Runtime>(app: AppHandle<R>, settings: Settings) -> Result<(), String> {
    crate::shortcuts::validate(&settings.shortcuts)?;
    save(&app, &settings).map_err(|e| e.to_string())?;
    if let Ok(mut s) = app.state::<SettingsState>().0.lock() {
        *s = settings.clone();
    }
    crate::shortcuts::apply(&app, &settings.shortcuts).map_err(|e| e.to_string())?;
    crate::native::apply_autostart(&app, settings.launch_at_login).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn there_are_no_global_shortcuts_by_default() {
        let d = Shortcuts::default();
        assert!(d.play_pause.is_none() && d.next.is_none() && d.previous.is_none());
        assert!(d.volume_up.is_none() && d.volume_down.is_none());
        assert!(d.mute.is_none() && d.show_hide.is_none());
    }

    #[test]
    fn recognises_the_old_defaults_only_when_nothing_else_was_set() {
        let legacy = Shortcuts {
            play_pause: Some("CommandOrControl+Shift+Space".into()),
            next: Some("CommandOrControl+Shift+Right".into()),
            previous: Some("CommandOrControl+Shift+Left".into()),
            ..Shortcuts::default()
        };
        assert!(legacy.is_legacy_default());
        let customised = Shortcuts {
            mute: Some("CommandOrControl+Alt+M".into()),
            ..legacy
        };
        assert!(!customised.is_legacy_default());
        assert!(!Shortcuts::default().is_legacy_default());
    }
}
