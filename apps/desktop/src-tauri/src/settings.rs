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

impl Default for Shortcuts {
    fn default() -> Self {
        Self {
            play_pause: Some("CommandOrControl+Shift+Space".into()),
            next: Some("CommandOrControl+Shift+Right".into()),
            previous: Some("CommandOrControl+Shift+Left".into()),
            volume_up: None,
            volume_down: None,
            mute: None,
            show_hide: None,
        }
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
    app.store(STORE_FILE)
        .ok()
        .and_then(|store| store.get(KEY))
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
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
    save(&app, &settings).map_err(|e| e.to_string())?;
    if let Ok(mut s) = app.state::<SettingsState>().0.lock() {
        *s = settings.clone();
    }
    crate::shortcuts::apply(&app, &settings.shortcuts).map_err(|e| e.to_string())?;
    crate::native::apply_autostart(&app, settings.launch_at_login).map_err(|e| e.to_string())?;
    Ok(())
}
