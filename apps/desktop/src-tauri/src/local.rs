//! Local music: the user's own audio files. This module finds them in the folders the user chose,
//! reads their tags and cover art, and hands a file's bytes to the UI, which plays them in its own
//! audio element. It never touches the YouTube player, and reads nothing outside those folders.
//!
//! The library itself (the index of what was found) lives in the UI's SQLite database; this side
//! only reports what it sees, so there is one place that owns the data.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use lofty::config::ParseOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use walkdir::WalkDir;

use crate::player::{PlayerCommand, MAIN_LABEL};

/// File types the scan picks up. The UI decides what its webview can actually play.
pub const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "m4a", "aac", "flac", "wav", "aif", "aiff", "ogg", "oga", "opus",
];

/// Names a folder's cover picture goes by, in the order they are tried.
const COVER_NAMES: &[&str] = &["cover", "folder", "front", "albumart", "album"];
const COVER_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp"];

/// Sidecar files bigger than this are not lyrics.
const MAX_SIDECAR_BYTES: u64 = 1024 * 1024;
const BATCH_SIZE: usize = 100;

#[derive(Default)]
pub struct LocalState {
    /// The folders the library is made of, canonicalised: files outside them are never read.
    roots: Mutex<Vec<PathBuf>>,
    /// A local song is the one playing, so tray, shortcut and media-key commands go to the UI.
    active: AtomicBool,
    scanning: AtomicBool,
}

pub fn is_active<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<LocalState>()
        .map(|s| s.active.load(Ordering::Relaxed))
        .unwrap_or(false)
}

/// Send a playback command from the tray, a shortcut or a media key to the UI's own player.
pub fn forward<R: Runtime>(app: &AppHandle<R>, command: &PlayerCommand) {
    if let Err(e) = app.emit_to(MAIN_LABEL, "local:command", command) {
        eprintln!("[local] {e}");
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedTrack {
    pub path: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub track_no: Option<u32>,
    pub disc_no: Option<u32>,
    pub year: Option<u32>,
    pub genre: Option<String>,
    pub duration_ms: u64,
    pub mtime: i64,
    pub size: u64,
    pub has_art: bool,
    pub lyrics: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct KnownFile {
    pub path: String,
    pub mtime: i64,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    /// Every audio file found, changed or not, so the UI can drop what has disappeared.
    pub seen: Vec<String>,
    pub added: usize,
    pub failed: usize,
}

pub fn has_audio_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// The path, canonicalised, if it is inside one of the library folders.
fn within_roots(path: &Path, roots: &[PathBuf]) -> Option<PathBuf> {
    let real = fs::canonicalize(path).ok()?;
    roots.iter().any(|r| real.starts_with(r)).then_some(real)
}

fn canonical_roots(roots: &[String]) -> Vec<PathBuf> {
    roots
        .iter()
        .filter_map(|r| fs::canonicalize(r).ok())
        .filter(|p| p.is_dir())
        .collect()
}

fn mtime_ms(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn clean(s: &str) -> Option<String> {
    let t = s.trim();
    (!t.is_empty()).then(|| t.chars().take(512).collect())
}

fn read_track(path: &Path, meta: &fs::Metadata) -> Option<ScannedTrack> {
    let options = ParseOptions::new().read_cover_art(false);
    let tagged = Probe::open(path).ok()?.options(options).read().ok()?;
    let duration_ms = tagged.properties().duration().as_millis() as u64;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();
    let get = |key: ItemKey| tag.and_then(|t| t.get_string(key)).and_then(clean);
    Some(ScannedTrack {
        path: path.to_string_lossy().into_owned(),
        title: tag
            .and_then(|t| t.title().and_then(|c| clean(&c)))
            .unwrap_or(stem),
        artist: tag
            .and_then(|t| t.artist().and_then(|c| clean(&c)))
            .unwrap_or_else(|| "Unknown artist".to_string()),
        album: tag.and_then(|t| t.album().and_then(|c| clean(&c))),
        album_artist: get(ItemKey::AlbumArtist),
        track_no: tag.and_then(|t| t.track()),
        disc_no: tag.and_then(|t| t.disk()),
        year: tag.and_then(|t| t.date()).map(|d| u32::from(d.year)),
        genre: tag.and_then(|t| t.genre().and_then(|c| clean(&c))),
        duration_ms,
        mtime: mtime_ms(meta),
        size: meta.len(),
        // Pictures are skipped while scanning (they are big); whether there is one is found when
        // the cover is asked for, so assume a tagged file may have one.
        has_art: tag.is_some(),
        lyrics: get(ItemKey::Lyrics)
            .or_else(|| get(ItemKey::UnsyncLyrics))
            .map(|l| l.chars().take(100_000).collect()),
    })
}

/// Walk the library folders and report the tags of every file that is new or changed since `known`.
/// New and changed files go to the UI in batches as `local:scan-batch` events, so a large library
/// shows up while it is still being read.
#[tauri::command]
pub async fn local_scan<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, LocalState>,
    roots: Vec<String>,
    known: Vec<KnownFile>,
) -> Result<ScanSummary, String> {
    let canonical = canonical_roots(&roots);
    *state.roots.lock().map_err(|_| "roots lock poisoned")? = canonical.clone();
    if state.scanning.swap(true, Ordering::SeqCst) {
        return Err("a scan is already running".into());
    }
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || scan(&handle, &canonical, known))
        .await
        .map_err(|e| e.to_string());
    state.scanning.store(false, Ordering::SeqCst);
    result
}

fn scan<R: Runtime>(app: &AppHandle<R>, roots: &[PathBuf], known: Vec<KnownFile>) -> ScanSummary {
    let known: HashMap<String, (i64, u64)> = known
        .into_iter()
        .map(|k| (k.path, (k.mtime, k.size)))
        .collect();
    let mut summary = ScanSummary {
        seen: Vec::new(),
        added: 0,
        failed: 0,
    };
    let mut batch: Vec<ScannedTrack> = Vec::new();
    let flush = |batch: &mut Vec<ScannedTrack>, found: usize| {
        if !batch.is_empty() {
            let _ = app.emit_to(MAIN_LABEL, "local:scan-batch", &*batch);
            batch.clear();
        }
        let _ = app.emit_to(MAIN_LABEL, "local:scan-progress", found);
    };
    for root in roots {
        for entry in WalkDir::new(root)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|e| e.file_type().is_file() && has_audio_extension(e.path()))
        {
            let path = entry.path();
            let key = path.to_string_lossy().into_owned();
            let Ok(meta) = entry.metadata() else {
                summary.failed += 1;
                continue;
            };
            summary.seen.push(key.clone());
            if known.get(&key) == Some(&(mtime_ms(&meta), meta.len())) {
                continue;
            }
            match read_track(path, &meta) {
                Some(track) => {
                    summary.added += 1;
                    batch.push(track);
                }
                None => summary.failed += 1,
            }
            if batch.len() >= BATCH_SIZE {
                flush(&mut batch, summary.seen.len());
            }
        }
    }
    flush(&mut batch, summary.seen.len());
    summary
}

fn roots_of<R: Runtime>(state: &State<'_, LocalState>, _app: &AppHandle<R>) -> Vec<PathBuf> {
    state.roots.lock().map(|r| r.clone()).unwrap_or_default()
}

/// The bytes of a library file, for the UI to play. Only audio inside the library folders.
#[tauri::command]
pub fn local_read_file<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, LocalState>,
    path: String,
) -> Result<tauri::ipc::Response, String> {
    let roots = roots_of(&state, &app);
    let real = within_roots(Path::new(&path), &roots).ok_or("not in your music folders")?;
    if !has_audio_extension(&real) {
        return Err("not an audio file".into());
    }
    let bytes = fs::read(&real).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// The cover of a library file: the picture inside it, or a `cover.jpg`-style file beside it.
/// Empty when there is none.
#[tauri::command]
pub fn local_artwork<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, LocalState>,
    path: String,
) -> Result<tauri::ipc::Response, String> {
    let roots = roots_of(&state, &app);
    let real = within_roots(Path::new(&path), &roots).ok_or("not in your music folders")?;
    let bytes = embedded_cover(&real)
        .or_else(|| folder_cover(&real))
        .unwrap_or_default();
    Ok(tauri::ipc::Response::new(bytes))
}

fn embedded_cover(path: &Path) -> Option<Vec<u8>> {
    let tagged = lofty::read_from_path(path).ok()?;
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag())?;
    let pictures = tag.pictures();
    let picture = pictures
        .iter()
        .find(|p| p.pic_type() == PictureType::CoverFront)
        .or_else(|| pictures.first())?;
    Some(picture.data().to_vec())
}

fn folder_cover(path: &Path) -> Option<Vec<u8>> {
    let dir = path.parent()?;
    let mut files: Vec<(usize, PathBuf)> = fs::read_dir(dir)
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|e| {
            let p = e.path();
            let stem = p.file_stem()?.to_str()?.to_ascii_lowercase();
            let ext = p.extension()?.to_str()?.to_ascii_lowercase();
            let rank = COVER_NAMES.iter().position(|n| *n == stem)?;
            COVER_EXTENSIONS
                .contains(&ext.as_str())
                .then_some((rank, p))
        })
        .collect();
    files.sort();
    let (_, best) = files.into_iter().next()?;
    (fs::metadata(&best).ok()?.len() <= 20 * 1024 * 1024)
        .then(|| fs::read(best).ok())
        .flatten()
}

/// Lyrics stored beside a song: `Song.lrc` (timed) or `Song.txt` (plain).
#[tauri::command]
pub fn local_lyrics_sidecar<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, LocalState>,
    path: String,
) -> Result<Option<String>, String> {
    let roots = roots_of(&state, &app);
    let real = within_roots(Path::new(&path), &roots).ok_or("not in your music folders")?;
    Ok(sidecar_lyrics(&real))
}

fn sidecar_lyrics(song: &Path) -> Option<String> {
    for ext in ["lrc", "txt"] {
        let candidate = song.with_extension(ext);
        let Ok(meta) = fs::metadata(&candidate) else {
            continue;
        };
        if meta.len() > MAX_SIDECAR_BYTES {
            continue;
        }
        if let Ok(text) = fs::read_to_string(&candidate) {
            if !text.trim().is_empty() {
                return Some(text);
            }
        }
    }
    None
}

/// The UI says whether a local song is the one playing, so native controls know where to send
/// their commands.
#[tauri::command]
pub fn local_set_active(state: State<'_, LocalState>, active: bool) {
    state.active.store(active, Ordering::Relaxed);
}

/// The UI reports what the local player is doing (a `track` or `state` event, as the bridge sends
/// them) so the tray, notifications and the Linux media session show it.
#[tauri::command]
pub fn local_report<R: Runtime>(app: AppHandle<R>, event: serde_json::Value) {
    crate::native::observe(&app, &event);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("melodesk-local-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::canonicalize(dir).unwrap()
    }

    #[test]
    fn knows_audio_files_by_extension() {
        assert!(has_audio_extension(Path::new("/m/Song.MP3")));
        assert!(has_audio_extension(Path::new("a.flac")));
        assert!(!has_audio_extension(Path::new("notes.txt")));
        assert!(!has_audio_extension(Path::new("noextension")));
    }

    #[test]
    fn only_files_inside_the_library_are_reachable() {
        let root = scratch("roots");
        let inside = root.join("a.mp3");
        fs::write(&inside, b"x").unwrap();
        let outside_dir = scratch("outside");
        let outside = outside_dir.join("b.mp3");
        fs::write(&outside, b"x").unwrap();
        let roots = vec![root.clone()];
        assert_eq!(within_roots(&inside, &roots), Some(inside.clone()));
        assert_eq!(within_roots(&outside, &roots), None);
        // `..` cannot climb out.
        let sneaky = root
            .join("..")
            .join(outside_dir.file_name().unwrap())
            .join("b.mp3");
        assert_eq!(within_roots(&sneaky, &roots), None);
        assert_eq!(within_roots(&root.join("missing.mp3"), &roots), None);
    }

    #[test]
    fn finds_a_cover_beside_the_song() {
        let dir = scratch("cover");
        let song = dir.join("t.mp3");
        fs::write(&song, b"x").unwrap();
        assert!(folder_cover(&song).is_none());
        fs::write(dir.join("Folder.JPG"), b"jpg-bytes").unwrap();
        fs::write(dir.join("front.png"), b"png-bytes").unwrap();
        // `cover` beats `folder` beats `front`; here only the last two exist, so `folder` wins.
        assert_eq!(folder_cover(&song).unwrap(), b"jpg-bytes");
        fs::write(dir.join("cover.png"), b"cover-bytes").unwrap();
        assert_eq!(folder_cover(&song).unwrap(), b"cover-bytes");
    }

    #[test]
    fn reads_lyrics_stored_beside_a_song() {
        let dir = scratch("lyrics");
        let song = dir.join("t.flac");
        fs::write(&song, b"x").unwrap();
        assert_eq!(sidecar_lyrics(&song), None);
        fs::write(dir.join("t.txt"), "plain words").unwrap();
        assert_eq!(sidecar_lyrics(&song).as_deref(), Some("plain words"));
        fs::write(dir.join("t.lrc"), "[00:01.00]timed").unwrap();
        assert_eq!(sidecar_lyrics(&song).as_deref(), Some("[00:01.00]timed"));
    }

    #[test]
    fn canonical_roots_skip_missing_folders_and_files() {
        let dir = scratch("canon");
        let file = dir.join("f.mp3");
        fs::write(&file, b"x").unwrap();
        let roots = canonical_roots(&[
            dir.to_string_lossy().into_owned(),
            file.to_string_lossy().into_owned(),
            "/definitely/not/here".to_string(),
        ]);
        assert_eq!(roots, vec![dir]);
    }
}
