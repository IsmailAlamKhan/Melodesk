//! Settings sync through a folder the user picks (iCloud Drive, Dropbox, OneDrive, Syncthing, a
//! network share…). Melodesk talks to no sync server and holds no account: it only reads and writes one
//! file, `melodesk-sync.json`, inside that folder, and whatever already syncs the folder does the rest.
//!
//! If the folder is a git repository (a clone of a private GitHub repository, say), Melodesk also pulls
//! before reading and commits and pushes after writing, using the `git` on this computer and whatever
//! sign-in it already has (an SSH key, a credential helper). Melodesk never sees a GitHub password or
//! token, and never asks for one: git cannot prompt here, so a repository that needs a prompt reports
//! an error instead.
//!
//! The UI chooses the folder (`sync_set_folder`) and everything after that goes through these commands,
//! so a page can neither name another file nor leave the folder. Writes go to a temporary file first and
//! are then renamed, so another device never reads half a file.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};

use serde::Serialize;

use crate::github::GithubState;
use tauri::{AppHandle, Runtime, State};

/// The one file that is read and written.
const FILE_NAME: &str = "melodesk-sync.json";
const TEMP_NAME: &str = ".melodesk-sync.json.tmp";
/// A settings file is small; anything bigger is not ours.
const MAX_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Default)]
pub struct SyncState {
    dir: Mutex<Option<PathBuf>>,
    /// Syncing goes through the person's GitHub account (see `github.rs`) instead of a folder.
    github: AtomicBool,
    /// One round at a time: a pull and a push must not run over each other.
    busy: Arc<Mutex<()>>,
}

impl SyncState {
    pub(crate) fn use_github(&self) {
        if let Ok(mut d) = self.dir.lock() {
            *d = None;
        }
        self.github.store(true, Ordering::SeqCst);
    }

    pub(crate) fn stop(&self) {
        if let Ok(mut d) = self.dir.lock() {
            *d = None;
        }
        self.github.store(false, Ordering::SeqCst);
    }
}

/// Where the sync file is kept right now.
enum Place {
    Folder(PathBuf),
    Github,
}

fn place(state: &SyncState) -> Result<Place, String> {
    if state.github.load(Ordering::SeqCst) {
        return Ok(Place::Github);
    }
    folder(state).map(Place::Folder)
}

/// How long a git command may take (a stuck network should not hang the app).
const GIT_TIMEOUT: Duration = Duration::from_secs(60);

fn is_git(dir: &Path) -> bool {
    dir.join(".git").exists()
}

/// Run `git` in `dir` without any prompt (a password, a passphrase, an editor) and with a time limit.
fn git(dir: &Path, args: &[&str]) -> Result<(bool, String), String> {
    let mut child = Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes")
        .env("GIT_EDITOR", "true")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("cannot run git: {e}"))?;
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() > GIT_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("git took too long (is it waiting for a sign-in?)".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(40)),
            Err(e) => return Err(format!("git failed: {e}")),
        }
    };
    let mut text = String::new();
    if let Some(mut out) = child.stdout.take() {
        let _ = out.read_to_string(&mut text);
    }
    let mut err = String::new();
    if let Some(mut e) = child.stderr.take() {
        let _ = e.read_to_string(&mut err);
    }
    if !status.success() && !err.trim().is_empty() {
        text = err;
    }
    Ok((status.success(), text.trim().to_string()))
}

/// The line of a git message that says what went wrong (git also prints progress lines first).
fn first_line(text: &str) -> String {
    text.lines()
        .find(|l| l.starts_with("fatal:") || l.starts_with("error:"))
        .or_else(|| text.lines().next())
        .unwrap_or("")
        .trim()
        .to_string()
}

/// Commit as the person if git knows who they are, else as Melodesk, so a merge or a commit cannot
/// fail just because this computer has no git identity yet.
fn identity(dir: &Path) -> Result<Vec<&'static str>, String> {
    let (_, email) = git(dir, &["config", "user.email"])?;
    Ok(if email.is_empty() {
        vec![
            "-c",
            "user.name=Melodesk",
            "-c",
            "user.email=melodesk@localhost",
        ]
    } else {
        Vec::new()
    })
}

/// Bring in what other computers pushed (a no-op when nothing is there yet).
fn git_pull(dir: &Path) -> Result<(), String> {
    let (_, remotes) = git(dir, &["remote"])?;
    if !remotes.lines().any(|r| r.trim() == "origin") {
        return Err("the folder is a git repository without a remote called origin".into());
    }
    // `symbolic-ref` also works in a repository with no commits yet.
    let (on_branch, branch) = git(dir, &["symbolic-ref", "--short", "HEAD"])?;
    if !on_branch || branch.is_empty() {
        return Err("the git repository has no branch checked out".into());
    }
    // Where both changed, take the other's lines: the merge of settings that follows keeps the
    // newer value of each one, so nothing is lost.
    let mut args: Vec<&str> = identity(dir)?;
    args.extend([
        "-c",
        "commit.gpgsign=false",
        "pull",
        "--no-rebase",
        "--no-edit",
        "-X",
        "theirs",
        "origin",
        &branch,
    ]);
    let (ok, message) = git(dir, &args)?;
    if ok {
        return Ok(());
    }
    // A brand-new repository has no such branch on GitHub yet: nothing to pull.
    if message.contains("couldn't find remote ref") || message.contains("no commits yet") {
        return Ok(());
    }
    Err(format!("git pull: {}", first_line(&message)))
}

/// Commit the sync file and push it. Nothing to commit is fine.
fn git_push(dir: &Path) -> Result<(), String> {
    let (ok, message) = git(dir, &["add", "--", FILE_NAME])?;
    if !ok {
        return Err(format!("git add: {}", first_line(&message)));
    }
    let (clean, _) = git(dir, &["diff", "--cached", "--quiet"])?;
    if !clean {
        let mut args: Vec<&str> = identity(dir)?;
        args.extend([
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-m",
            "Melodesk settings sync",
            "--no-verify",
        ]);
        let (ok, message) = git(dir, &args)?;
        if !ok {
            return Err(format!("git commit: {}", first_line(&message)));
        }
    }
    let (ok, message) = git(dir, &["push", "--set-upstream", "origin", "HEAD"])?;
    if !ok {
        return Err(format!("git push: {}", first_line(&message)));
    }
    Ok(())
}

fn folder(state: &SyncState) -> Result<PathBuf, String> {
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

/// Read the sync file, after pulling if the folder is a git repository.
fn read_synced(dir: &Path) -> Result<Option<String>, String> {
    if is_git(dir) {
        git_pull(dir)?;
    }
    read_in(dir)
}

/// Write the sync file, then commit and push if the folder is a git repository.
fn write_synced(dir: &Path, text: &str) -> Result<(), String> {
    write_in(dir, text)?;
    if is_git(dir) {
        git_push(dir)?;
    }
    Ok(())
}

#[derive(Serialize)]
pub struct Chosen {
    pub path: String,
    /// The folder is a git repository, so syncing goes through git.
    pub git: bool,
}

/// Make `path` the sync folder: it must exist and be one we can write in.
pub(crate) fn choose(state: &SyncState, path: &Path) -> Result<Chosen, String> {
    let real = fs::canonicalize(path).map_err(|e| format!("cannot open that folder: {e}"))?;
    if !real.is_dir() {
        return Err("that is not a folder".into());
    }
    // Fail now, not at the first sync, if it cannot be written in.
    let probe = real.join(".melodesk-sync-probe");
    fs::write(&probe, b"").map_err(|e| format!("cannot write in that folder: {e}"))?;
    let _ = fs::remove_file(&probe);
    let chosen = Chosen {
        path: real.display().to_string(),
        git: is_git(&real),
    };
    state.github.store(false, Ordering::SeqCst);
    *state
        .dir
        .lock()
        .map_err(|_| "sync lock poisoned".to_string())? = Some(real);
    Ok(chosen)
}

/// Choose the folder (None stops syncing).
#[tauri::command]
pub fn sync_set_folder(
    state: State<'_, SyncState>,
    path: Option<String>,
) -> Result<Option<Chosen>, String> {
    match path {
        None => {
            state.stop();
            Ok(None)
        }
        Some(p) => choose(&state, Path::new(&p)).map(Some),
    }
}

/// Run blocking work (a file, a git command) off the async runtime's threads.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sync_read<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, SyncState>,
    gh: State<'_, GithubState>,
) -> Result<Option<String>, String> {
    match place(&state)? {
        Place::Github => crate::github::read(&app, &gh).await,
        Place::Folder(dir) => {
            let busy = state.busy.clone();
            blocking(move || {
                let _round = busy.lock().map_err(|_| "sync lock poisoned".to_string())?;
                read_synced(&dir)
            })
            .await
        }
    }
}

#[tauri::command]
pub async fn sync_write<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, SyncState>,
    gh: State<'_, GithubState>,
    text: String,
) -> Result<(), String> {
    match place(&state)? {
        Place::Github => crate::github::write(&app, &gh, &text).await,
        Place::Folder(dir) => {
            let busy = state.busy.clone();
            blocking(move || {
                let _round = busy.lock().map_err(|_| "sync lock poisoned".to_string())?;
                write_synced(&dir, &text)
            })
            .await
        }
    }
}

#[tauri::command]
pub async fn sync_stamp<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, SyncState>,
    gh: State<'_, GithubState>,
) -> Result<Option<u64>, String> {
    match place(&state)? {
        Place::Github => crate::github::stamp(&app, &gh).await,
        Place::Folder(dir) => {
            let busy = state.busy.clone();
            blocking(move || {
                let _round = busy.lock().map_err(|_| "sync lock poisoned".to_string())?;
                // In a git repository the file only changes when something is pulled.
                if is_git(&dir) {
                    git_pull(&dir)?;
                }
                Ok(stamp_in(&dir))
            })
            .await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("melodesk-sync-{name}-{}", std::process::id()));
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

    fn git_ok(dir: &Path, args: &[&str]) {
        let (ok, message) = git(dir, args).unwrap();
        assert!(ok, "git {args:?}: {message}");
    }

    /// A bare repository standing in for GitHub, and two clones of it (two computers).
    fn two_computers(name: &str) -> (PathBuf, PathBuf) {
        let root = scratch(name);
        let remote = root.join("remote.git");
        fs::create_dir_all(&remote).unwrap();
        git_ok(&remote, &["init", "--bare", "--initial-branch=main"]);
        let a = root.join("a");
        let b = root.join("b");
        for clone in [&a, &b] {
            fs::create_dir_all(clone).unwrap();
            git_ok(clone, &["init", "--initial-branch=main"]);
            git_ok(
                clone,
                &["remote", "add", "origin", remote.to_str().unwrap()],
            );
        }
        (a, b)
    }

    #[test]
    fn through_git_one_computer_pushes_and_the_other_pulls() {
        let (a, b) = two_computers("git-roundtrip");
        // Nothing pushed yet: reading finds nothing, and does not fail.
        assert_eq!(read_synced(&a).unwrap(), None);
        write_synced(&a, "{\"from\":\"a\"}").unwrap();
        assert_eq!(
            read_synced(&b).unwrap().as_deref(),
            Some("{\"from\":\"a\"}")
        );
        write_synced(&b, "{\"from\":\"b\"}").unwrap();
        assert_eq!(
            read_synced(&a).unwrap().as_deref(),
            Some("{\"from\":\"b\"}")
        );
        // Writing the same thing again commits nothing and still succeeds.
        write_synced(&a, "{\"from\":\"b\"}").unwrap();
    }

    #[test]
    fn two_computers_that_both_wrote_still_end_up_with_one_file() {
        let (a, b) = two_computers("git-diverged");
        write_synced(&a, "one").unwrap();
        read_synced(&b).unwrap();
        // Both change it before either pulls: b committed but its push was refused.
        write_synced(&a, "two-from-a").unwrap();
        fs::write(b.join(FILE_NAME), "two-from-b").unwrap();
        git_ok(&b, &["add", "--", FILE_NAME]);
        git_ok(
            &b,
            &[
                "-c",
                "user.name=T",
                "-c",
                "user.email=t@example.com",
                "commit",
                "-m",
                "b",
            ],
        );
        // Reading merges, taking a's lines (the settings merge that follows sorts out the rest),
        // and the next write goes through.
        assert_eq!(read_synced(&b).unwrap().as_deref(), Some("two-from-a"));
        write_synced(&b, "merged").unwrap();
        assert_eq!(read_synced(&a).unwrap().as_deref(), Some("merged"));
    }

    #[test]
    fn a_repository_without_origin_says_so() {
        let root = scratch("git-no-origin");
        git_ok(&root, &["init", "--initial-branch=main"]);
        let err = read_synced(&root).unwrap_err();
        assert!(err.contains("origin"), "{err}");
    }
}
