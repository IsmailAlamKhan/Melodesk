//! Settings sync through a folder the user picks (iCloud Drive, Dropbox, OneDrive, Syncthing, a
//! network share…). Melodesk talks to no sync server and holds no account: it only reads and writes one
//! file, `melodesk-sync.json`, inside that folder, and whatever already syncs the folder does the rest.
//!
//! The UI chooses the folder (`sync_set_folder`) and everything after that goes through these commands,
//! so a page can neither name another file nor leave the folder. Writes go to a temporary file first and
//! are then renamed, so another device never reads half a file.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use tauri::State;

/// The one file that is read and written.
const FILE_NAME: &str = "melodesk-sync.json";
const TEMP_NAME: &str = ".melodesk-sync.json.tmp";
/// A settings file is small; anything bigger is not ours.
const MAX_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Default)]
pub struct SyncState {
    dir: Mutex<Option<PathBuf>>,
}

fn folder(state: &State<'_, SyncState>) -> Result<PathBuf, String> {
    state
        .dir
        .lock()
        .map_err(|_| "sync lock poisoned".to_string())?
        .clone()
        .ok_or_else(|| "no sync folder chosen".to_string())
}

/// Read the sync file in `dir`, or None if there is not one yet.
fn read_in(dir: &Path) -> Result<Option<String>, String> {
    let path = dir.join(FILE_NAME);
    match fs::metadata(&path) {
        Ok(meta) if meta.is_file() => {
            if meta.len() > MAX_BYTES {
                return Err("the sync file is too big to be ours".into());
            }
            fs::read_to_string(&path)
                .map(Some)
                .map_err(|e| format!("cannot read the sync file: {e}"))
        }
        Ok(_) => Err("the sync file is not a file".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("cannot read the sync file: {e}")),
    }
}

/// Write the sync file in `dir` through a temporary file and a rename.
fn write_in(dir: &Path, text: &str) -> Result<(), String> {
    if text.len() as u64 > MAX_BYTES {
        return Err("too much to sync".into());
    }
    let temp = dir.join(TEMP_NAME);
    fs::write(&temp, text).map_err(|e| format!("cannot write in the sync folder: {e}"))?;
    fs::rename(&temp, dir.join(FILE_NAME)).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("cannot write in the sync folder: {e}")
    })
}

/// When the sync file last changed, in ms since 1970 (None if there is not one).
fn stamp_in(dir: &Path) -> Option<u64> {
    let modified = fs::metadata(dir.join(FILE_NAME)).ok()?.modified().ok()?;
    let ms = modified.duration_since(UNIX_EPOCH).ok()?.as_millis();
    u64::try_from(ms).ok()
}

/// Choose the folder (None stops syncing). The folder must exist and be one we can write in.
#[tauri::command]
pub fn sync_set_folder(
    state: State<'_, SyncState>,
    path: Option<String>,
) -> Result<Option<String>, String> {
    let chosen = match path {
        None => None,
        Some(p) => {
            let real = fs::canonicalize(&p).map_err(|e| format!("cannot open that folder: {e}"))?;
            if !real.is_dir() {
                return Err("that is not a folder".into());
            }
            // Fail now, not at the first sync, if it cannot be written in.
            let probe = real.join(".melodesk-sync-probe");
            fs::write(&probe, b"").map_err(|e| format!("cannot write in that folder: {e}"))?;
            let _ = fs::remove_file(&probe);
            Some(real)
        }
    };
    let shown = chosen.as_ref().map(|p| p.display().to_string());
    *state
        .dir
        .lock()
        .map_err(|_| "sync lock poisoned".to_string())? = chosen;
    Ok(shown)
}

#[tauri::command]
pub fn sync_read(state: State<'_, SyncState>) -> Result<Option<String>, String> {
    read_in(&folder(&state)?)
}

#[tauri::command]
pub fn sync_write(state: State<'_, SyncState>, text: String) -> Result<(), String> {
    write_in(&folder(&state)?, &text)
}

#[tauri::command]
pub fn sync_stamp(state: State<'_, SyncState>) -> Result<Option<u64>, String> {
    Ok(stamp_in(&folder(&state)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("melodesk-sync-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_folder_without_the_file_reads_as_nothing_yet() {
        let dir = scratch("empty");
        assert_eq!(read_in(&dir).unwrap(), None);
        assert_eq!(stamp_in(&dir), None);
    }

    #[test]
    fn what_is_written_is_read_back_and_no_temp_file_is_left() {
        let dir = scratch("roundtrip");
        write_in(&dir, "{\"a\":1}").unwrap();
        assert_eq!(read_in(&dir).unwrap().as_deref(), Some("{\"a\":1}"));
        write_in(&dir, "{\"a\":2}").unwrap();
        assert_eq!(read_in(&dir).unwrap().as_deref(), Some("{\"a\":2}"));
        assert!(!dir.join(TEMP_NAME).exists());
        assert!(stamp_in(&dir).is_some());
    }

    #[test]
    fn a_file_that_is_too_big_is_refused_both_ways() {
        let dir = scratch("big");
        let big = "x".repeat(MAX_BYTES as usize + 1);
        assert!(write_in(&dir, &big).is_err());
        fs::write(dir.join(FILE_NAME), &big).unwrap();
        assert!(read_in(&dir).is_err());
    }

    #[test]
    fn a_directory_in_the_place_of_the_file_is_not_read() {
        let dir = scratch("dirfile");
        fs::create_dir(dir.join(FILE_NAME)).unwrap();
        assert!(read_in(&dir).is_err());
    }
}
