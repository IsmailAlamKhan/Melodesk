//! Where Melodesk keeps the few secrets it holds for the person: the GitHub sign-in for settings sync and
//! the sync code of the Melodesk server. In the operating system's keychain (macOS Keychain, Windows
//! Credential Manager); on Linux, which has no keychain every desktop agrees on, in a file only the user
//! can read. A secret has a fixed name, so a page cannot ask for anything else.

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod imp {
    const SERVICE: &str = "Melodesk";

    fn entry(name: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, name).map_err(|e| format!("cannot reach the keychain: {e}"))
    }
    pub fn load<R: tauri::Runtime>(_app: &tauri::AppHandle<R>, name: &str) -> Option<String> {
        entry(name).ok()?.get_password().ok()
    }
    pub fn save<R: tauri::Runtime>(
        _app: &tauri::AppHandle<R>,
        name: &str,
        value: &str,
    ) -> Result<(), String> {
        entry(name)?
            .set_password(value)
            .map_err(|e| format!("cannot save to the keychain: {e}"))
    }
    pub fn clear<R: tauri::Runtime>(_app: &tauri::AppHandle<R>, name: &str) {
        if let Ok(e) = entry(name) {
            let _ = e.delete_credential();
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod imp {
    use std::fs;
    use std::path::PathBuf;
    use tauri::Manager;

    fn path<R: tauri::Runtime>(app: &tauri::AppHandle<R>, name: &str) -> Option<PathBuf> {
        app.path().app_data_dir().ok().map(|d| d.join(name))
    }
    pub fn load<R: tauri::Runtime>(app: &tauri::AppHandle<R>, name: &str) -> Option<String> {
        let text = fs::read_to_string(path(app, name)?).ok()?;
        let text = text.trim().to_string();
        (!text.is_empty()).then_some(text)
    }
    pub fn save<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        name: &str,
        value: &str,
    ) -> Result<(), String> {
        let path = path(app, name).ok_or("cannot find the app's data folder")?;
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        fs::write(&path, value).map_err(|e| format!("cannot save it: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
        }
        Ok(())
    }
    pub fn clear<R: tauri::Runtime>(app: &tauri::AppHandle<R>, name: &str) {
        if let Some(p) = path(app, name) {
            let _ = fs::remove_file(p);
        }
    }
}

pub use imp::{clear, load, save};
