//! One-click settings sync through the cloud folder the computer already has. iCloud Drive comes with
//! macOS and OneDrive with Windows, and Dropbox and Google Drive put a folder on the disk too: if one
//! of those folders is there, Melodesk offers it, makes a `Melodesk` folder inside and syncs through
//! it (see `sync.rs`). Nothing to install, no sign-in of ours, no token: the computer's own cloud
//! client does the uploading.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::sync::{choose, Chosen, SyncState};

/// The folder made inside the cloud folder.
const FOLDER_NAME: &str = "Melodesk";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CloudOption {
    pub id: &'static str,
    pub name: &'static str,
    /// The cloud folder itself (the `Melodesk` folder is made inside it when it is chosen).
    pub path: String,
}

fn dir(path: PathBuf) -> Option<PathBuf> {
    path.is_dir().then_some(path)
}

/// Folders inside `parent` whose name starts with `prefix` (the cloud client names them
/// `OneDrive - Company`, `GoogleDrive-name@example.com`…), sorted so the answer is stable.
fn starting_with(parent: &Path, prefix: &str) -> Vec<PathBuf> {
    let mut found: Vec<PathBuf> = fs::read_dir(parent)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with(prefix))
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    found.sort();
    found
}

/// The cloud folders that exist on this computer. `env` reads an environment variable.
pub fn detect(home: &Path, env: &dyn Fn(&str) -> Option<String>) -> Vec<CloudOption> {
    let mut out = Vec::new();
    let mut add = |id: &'static str, name: &'static str, path: Option<PathBuf>| {
        if let Some(path) = path {
            out.push(CloudOption {
                id,
                name,
                path: path.display().to_string(),
            });
        }
    };
    let storage = home.join("Library").join("CloudStorage");

    add(
        "icloud",
        "iCloud Drive",
        dir(home.join("Library/Mobile Documents/com~apple~CloudDocs")),
    );

    // OneDrive: Windows sets variables for it; on a Mac it lives in CloudStorage; older installs
    // put it in the home folder.
    let onedrive = ["OneDriveConsumer", "OneDrive", "OneDriveCommercial"]
        .iter()
        .filter_map(|v| env(v))
        .map(PathBuf::from)
        .find_map(dir)
        .or_else(|| starting_with(&storage, "OneDrive").into_iter().next())
        .or_else(|| dir(home.join("OneDrive")));
    add("onedrive", "OneDrive", onedrive);

    let dropbox = starting_with(&storage, "Dropbox")
        .into_iter()
        .next()
        .or_else(|| dir(home.join("Dropbox")));
    add("dropbox", "Dropbox", dropbox);

    // Google Drive for desktop: "My Drive" inside the account's folder on a Mac, a folder in the home
    // folder on others.
    let gdrive = starting_with(&storage, "GoogleDrive")
        .into_iter()
        .find_map(|p| dir(p.join("My Drive")))
        .or_else(|| dir(home.join("Google Drive")))
        .or_else(|| dir(home.join("My Drive")));
    add("gdrive", "Google Drive", gdrive);

    out
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// Which cloud folders this computer has, for the settings page to offer.
#[tauri::command]
pub fn sync_cloud_options() -> Vec<CloudOption> {
    home_dir()
        .map(|home| detect(&home, &|name| std::env::var(name).ok()))
        .unwrap_or_default()
}

/// Sync through one of them: make a `Melodesk` folder in it and use that.
#[tauri::command]
pub fn sync_use_cloud(state: State<'_, SyncState>, id: String) -> Result<Chosen, String> {
    let home = home_dir().ok_or("cannot find the home folder")?;
    let option = detect(&home, &|name| std::env::var(name).ok())
        .into_iter()
        .find(|o| o.id == id)
        .ok_or("that cloud folder is not on this computer")?;
    let target = Path::new(&option.path).join(FOLDER_NAME);
    fs::create_dir_all(&target).map_err(|e| format!("cannot make the Melodesk folder: {e}"))?;
    choose(&state, &target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("melodesk-cloud-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn no_env(_: &str) -> Option<String> {
        None
    }

    fn ids(found: &[CloudOption]) -> Vec<&'static str> {
        found.iter().map(|o| o.id).collect()
    }

    #[test]
    fn a_computer_without_cloud_folders_offers_none() {
        let home = scratch("none");
        assert!(detect(&home, &no_env).is_empty());
    }

    #[test]
    fn finds_the_folders_a_mac_has() {
        let home = scratch("mac");
        fs::create_dir_all(home.join("Library/Mobile Documents/com~apple~CloudDocs")).unwrap();
        fs::create_dir_all(home.join("Library/CloudStorage/Dropbox")).unwrap();
        fs::create_dir_all(home.join("Library/CloudStorage/OneDrive-Personal")).unwrap();
        fs::create_dir_all(home.join("Library/CloudStorage/GoogleDrive-a@b.c/My Drive")).unwrap();
        let found = detect(&home, &no_env);
        assert_eq!(ids(&found), ["icloud", "onedrive", "dropbox", "gdrive"]);
        assert!(found[3].path.ends_with("My Drive"));
    }

    #[test]
    fn finds_onedrive_where_windows_says_it_is() {
        let home = scratch("win");
        let onedrive = home.join("Somewhere").join("OneDrive");
        fs::create_dir_all(&onedrive).unwrap();
        let where_it_is = onedrive.display().to_string();
        let env = move |name: &str| (name == "OneDrive").then(|| where_it_is.clone());
        assert_eq!(ids(&detect(&home, &env)), ["onedrive"]);
        // A variable that points nowhere is not trusted.
        let missing = |name: &str| (name == "OneDrive").then(|| "/no/such/folder".to_string());
        assert!(detect(&scratch("win-missing"), &missing).is_empty());
    }

    #[test]
    fn finds_the_plain_home_folders() {
        let home = scratch("plain");
        fs::create_dir_all(home.join("Dropbox")).unwrap();
        fs::create_dir_all(home.join("Google Drive")).unwrap();
        assert_eq!(ids(&detect(&home, &no_env)), ["dropbox", "gdrive"]);
    }

    #[test]
    fn a_google_drive_account_folder_without_my_drive_is_not_offered() {
        let home = scratch("gdrive-empty");
        fs::create_dir_all(home.join("Library/CloudStorage/GoogleDrive-a@b.c")).unwrap();
        assert!(detect(&home, &no_env).is_empty());
    }
}
