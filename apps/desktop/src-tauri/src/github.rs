//! Settings sync through the person's own GitHub account, with nothing else to install. Melodesk signs
//! in with GitHub's *device flow* (the way a TV app signs in: it shows a short code, the person types
//! it at github.com/login/device and says yes), asking only for the `gist` permission, which can touch
//! the person's gists and nothing else on their account. The sync file lives in one secret gist.
//!
//! The access token is kept in the operating system's keychain (macOS Keychain, Windows Credential
//! Manager); on Linux, which has no keychain every desktop agrees on, in a file only the user can read.
//! It is never sent anywhere but api.github.com. Sign out forgets it (the person can also revoke it at
//! github.com/settings/applications).
//!
//! Needs an OAuth app registered once by whoever builds Melodesk: its *client id* (public, no secret) is
//! built in through `MELODESK_GITHUB_CLIENT_ID`. Without one, sign-in is not offered.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_http::reqwest;

use crate::sync::SyncState;

/// The client id of Melodesk's OAuth app on GitHub, set when it is built.
const CLIENT_ID: Option<&str> = option_env!("MELODESK_GITHUB_CLIENT_ID");
const API: &str = "https://api.github.com";
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
/// The only permission asked for.
const SCOPE: &str = "gist";
const DESCRIPTION: &str = "Melodesk settings sync (safe to delete; Melodesk makes it again)";
const FILE: &str = "melodesk-sync.json";
const USER_AGENT: &str = concat!("Melodesk/", env!("CARGO_PKG_VERSION"));
/// How many pages of 100 gists are looked through for ours.
const MAX_PAGES: u32 = 10;

#[derive(Default)]
pub struct GithubState {
    /// The code a sign-in is waiting on.
    pending: Mutex<Option<String>>,
    /// The gist that holds the sync file, once found.
    gist: Mutex<Option<String>>,
    /// The token, kept in memory after it is first read.
    token: Mutex<Option<String>>,
}

fn client_id() -> Option<&'static str> {
    CLIENT_ID.filter(|id| !id.trim().is_empty())
}

// ---- the token's home -----------------------------------------------------------------------

#[cfg(any(target_os = "macos", target_os = "windows"))]
mod vault {
    const SERVICE: &str = "Melodesk";
    const USER: &str = "github-settings-sync";

    fn entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, USER).map_err(|e| format!("cannot reach the keychain: {e}"))
    }
    pub fn load<R: tauri::Runtime>(_app: &tauri::AppHandle<R>) -> Option<String> {
        entry().ok()?.get_password().ok()
    }
    pub fn save<R: tauri::Runtime>(_app: &tauri::AppHandle<R>, token: &str) -> Result<(), String> {
        entry()?
            .set_password(token)
            .map_err(|e| format!("cannot save to the keychain: {e}"))
    }
    pub fn clear<R: tauri::Runtime>(_app: &tauri::AppHandle<R>) {
        if let Ok(e) = entry() {
            let _ = e.delete_credential();
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod vault {
    use std::fs;
    use std::path::PathBuf;
    use tauri::Manager;

    fn path<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<PathBuf> {
        app.path()
            .app_data_dir()
            .ok()
            .map(|d| d.join("github-token"))
    }
    pub fn load<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<String> {
        let text = fs::read_to_string(path(app)?).ok()?;
        let text = text.trim().to_string();
        (!text.is_empty()).then_some(text)
    }
    pub fn save<R: tauri::Runtime>(app: &tauri::AppHandle<R>, token: &str) -> Result<(), String> {
        let path = path(app).ok_or("cannot find the app's data folder")?;
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        fs::write(&path, token).map_err(|e| format!("cannot save the token: {e}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
        }
        Ok(())
    }
    pub fn clear<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
        if let Some(p) = path(app) {
            let _ = fs::remove_file(p);
        }
    }
}

fn token<R: Runtime>(app: &AppHandle<R>, gh: &GithubState) -> Option<String> {
    let mut cached = gh.token.lock().ok()?;
    if cached.is_none() {
        *cached = vault::load(app);
    }
    cached.clone()
}

fn forget_token<R: Runtime>(app: &AppHandle<R>, gh: &GithubState) {
    vault::clear(app);
    if let Ok(mut t) = gh.token.lock() {
        *t = None;
    }
    if let Ok(mut g) = gh.gist.lock() {
        *g = None;
    }
}

// ---- reading what GitHub says (pure, so it can be tested) -----------------------------------

#[derive(Debug, PartialEq, Eq)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

pub fn parse_device_code(text: &str) -> Result<DeviceCode, String> {
    let v: Value =
        serde_json::from_str(text).map_err(|_| "GitHub answered something unexpected")?;
    if let Some(err) = v["error"].as_str() {
        return Err(match err {
            "device_flow_disabled" => {
                "Device sign-in is not switched on for Melodesk's GitHub app".into()
            }
            other => format!("GitHub said: {other}"),
        });
    }
    let text_of = |k: &str| v[k].as_str().map(str::to_string);
    Ok(DeviceCode {
        device_code: text_of("device_code").ok_or("GitHub's answer had no code")?,
        user_code: text_of("user_code").ok_or("GitHub's answer had no code to type")?,
        verification_uri: text_of("verification_uri").ok_or("GitHub's answer had no address")?,
        expires_in: v["expires_in"].as_u64().unwrap_or(900),
        interval: v["interval"].as_u64().unwrap_or(5).max(1),
    })
}

#[derive(Debug, PartialEq, Eq)]
pub enum Poll {
    Pending,
    SlowDown,
    Expired,
    Denied,
    Done(String),
    Failed(String),
}

pub fn parse_poll(text: &str) -> Poll {
    let Ok(v) = serde_json::from_str::<Value>(text) else {
        return Poll::Failed("GitHub answered something unexpected".into());
    };
    if let Some(t) = v["access_token"].as_str() {
        return Poll::Done(t.to_string());
    }
    match v["error"].as_str() {
        Some("authorization_pending") => Poll::Pending,
        Some("slow_down") => Poll::SlowDown,
        Some("expired_token") => Poll::Expired,
        Some("access_denied") => Poll::Denied,
        Some(other) => Poll::Failed(format!("GitHub said: {other}")),
        None => Poll::Failed("GitHub's answer had no token".into()),
    }
}

/// The id of our gist in a page of the person's gists.
pub fn pick_gist(page: &Value) -> Option<String> {
    page.as_array()?
        .iter()
        .find(|g| g["description"].as_str() == Some(DESCRIPTION) && g["files"].get(FILE).is_some())
        .and_then(|g| g["id"].as_str())
        .map(str::to_string)
}

/// What a gist says about the sync file: its text, or where to fetch it when GitHub cut it short.
#[derive(Debug, PartialEq, Eq)]
pub enum GistFile {
    Text(String),
    Truncated(String),
    Missing,
}

pub fn gist_file(gist: &Value) -> GistFile {
    let file = &gist["files"][FILE];
    if file.is_null() {
        return GistFile::Missing;
    }
    if file["truncated"].as_bool() == Some(true) {
        return file["raw_url"]
            .as_str()
            .map_or(GistFile::Missing, |u| GistFile::Truncated(u.to_string()));
    }
    file["content"]
        .as_str()
        .map_or(GistFile::Missing, |c| GistFile::Text(c.to_string()))
}

pub fn create_body(text: &str) -> Value {
    json!({ "description": DESCRIPTION, "public": false, "files": { FILE: { "content": text } } })
}

pub fn update_body(text: &str) -> Value {
    json!({ "files": { FILE: { "content": text } } })
}

/// A number that changes when the gist does (the settings page only compares two of them).
pub fn stamp_of(updated_at: &str) -> u64 {
    updated_at.bytes().fold(0xcbf2_9ce4_8422_2325_u64, |h, b| {
        (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3)
    })
}

// ---- talking to GitHub ----------------------------------------------------------------------

fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())
}

/// One request; the answer's status and text.
async fn send(
    method: reqwest::Method,
    url: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> Result<(u16, String), String> {
    let mut req = http()?
        .request(method, url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
    if let Some(t) = token {
        req = req.header("Authorization", format!("Bearer {t}"));
    }
    if let Some(b) = body {
        req = req
            .header("Content-Type", "application/json")
            .body(b.to_string());
    }
    let res = req
        .send()
        .await
        .map_err(|e| format!("cannot reach GitHub: {e}"))?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok((status, text))
}

/// An answer from api.github.com, or why not. 401 means the token is no good any more.
fn checked<R: Runtime>(
    app: &AppHandle<R>,
    gh: &GithubState,
    (status, text): (u16, String),
) -> Result<String, String> {
    match status {
        200..=299 => Ok(text),
        401 => {
            forget_token(app, gh);
            Err("github-signed-out".into())
        }
        403 | 429 => Err("GitHub is limiting requests for now; it will be tried again".into()),
        404 => Err("github-not-found".into()),
        other => Err(format!("GitHub answered {other}")),
    }
}

async fn find_gist<R: Runtime>(
    app: &AppHandle<R>,
    gh: &GithubState,
    token: &str,
) -> Result<Option<String>, String> {
    if let Some(id) = gh.gist.lock().map_err(|_| "lock")?.clone() {
        return Ok(Some(id));
    }
    for page in 1..=MAX_PAGES {
        let url = format!("{API}/gists?per_page=100&page={page}");
        let text = checked(
            app,
            gh,
            send(reqwest::Method::GET, &url, Some(token), None).await?,
        )?;
        let value: Value =
            serde_json::from_str(&text).map_err(|_| "GitHub answered something unexpected")?;
        if let Some(id) = pick_gist(&value) {
            *gh.gist.lock().map_err(|_| "lock")? = Some(id.clone());
            return Ok(Some(id));
        }
        if value.as_array().is_none_or(|a| a.len() < 100) {
            break;
        }
    }
    Ok(None)
}

fn signed_in<R: Runtime>(app: &AppHandle<R>, gh: &GithubState) -> Result<String, String> {
    token(app, gh).ok_or_else(|| "github-signed-out".to_string())
}

pub async fn read<R: Runtime>(
    app: &AppHandle<R>,
    gh: &GithubState,
) -> Result<Option<String>, String> {
    let token = signed_in(app, gh)?;
    let Some(id) = find_gist(app, gh, &token).await? else {
        return Ok(None);
    };
    let url = format!("{API}/gists/{id}");
    let text = match checked(
        app,
        gh,
        send(reqwest::Method::GET, &url, Some(&token), None).await?,
    ) {
        Ok(t) => t,
        Err(e) if e == "github-not-found" => {
            // Deleted on github.com: forget it, and a write makes a new one.
            *gh.gist.lock().map_err(|_| "lock")? = None;
            return Ok(None);
        }
        Err(e) => return Err(e),
    };
    let gist: Value =
        serde_json::from_str(&text).map_err(|_| "GitHub answered something unexpected")?;
    match gist_file(&gist) {
        GistFile::Text(t) => Ok(Some(t)),
        GistFile::Missing => Ok(None),
        GistFile::Truncated(raw) => {
            let (status, body) = send(reqwest::Method::GET, &raw, None, None).await?;
            if status == 200 {
                Ok(Some(body))
            } else {
                Err(format!("GitHub answered {status}"))
            }
        }
    }
}

pub async fn write<R: Runtime>(
    app: &AppHandle<R>,
    gh: &GithubState,
    text: &str,
) -> Result<(), String> {
    let token = signed_in(app, gh)?;
    if let Some(id) = find_gist(app, gh, &token).await? {
        let url = format!("{API}/gists/{id}");
        let answer = send(
            reqwest::Method::PATCH,
            &url,
            Some(&token),
            Some(update_body(text)),
        )
        .await?;
        match checked(app, gh, answer) {
            Ok(_) => return Ok(()),
            Err(e) if e == "github-not-found" => *gh.gist.lock().map_err(|_| "lock")? = None,
            Err(e) => return Err(e),
        }
    }
    let url = format!("{API}/gists");
    let answer = send(
        reqwest::Method::POST,
        &url,
        Some(&token),
        Some(create_body(text)),
    )
    .await?;
    let made = checked(app, gh, answer)?;
    let value: Value =
        serde_json::from_str(&made).map_err(|_| "GitHub answered something unexpected")?;
    *gh.gist.lock().map_err(|_| "lock")? = value["id"].as_str().map(str::to_string);
    Ok(())
}

pub async fn stamp<R: Runtime>(
    app: &AppHandle<R>,
    gh: &GithubState,
) -> Result<Option<u64>, String> {
    let token = signed_in(app, gh)?;
    let Some(id) = find_gist(app, gh, &token).await? else {
        return Ok(None);
    };
    let url = format!("{API}/gists/{id}");
    match checked(
        app,
        gh,
        send(reqwest::Method::GET, &url, Some(&token), None).await?,
    ) {
        Ok(text) => {
            let gist: Value =
                serde_json::from_str(&text).map_err(|_| "GitHub answered something unexpected")?;
            Ok(gist["updated_at"].as_str().map(stamp_of))
        }
        Err(e) if e == "github-not-found" => {
            *gh.gist.lock().map_err(|_| "lock")? = None;
            Ok(None)
        }
        Err(e) => Err(e),
    }
}

// ---- commands -------------------------------------------------------------------------------

/// Whether this build can sign in to GitHub (it has a client id).
#[tauri::command]
pub fn sync_github_available() -> bool {
    client_id().is_some()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceStart {
    user_code: String,
    verification_uri: String,
    interval: u64,
    expires_in: u64,
}

/// Begin signing in: GitHub gives a short code to type at its own page.
#[tauri::command]
pub async fn sync_github_start(gh: State<'_, GithubState>) -> Result<DeviceStart, String> {
    let id = client_id().ok_or("this build has no GitHub sign-in")?;
    let body = json!({ "client_id": id, "scope": SCOPE });
    let (status, text) = send(reqwest::Method::POST, DEVICE_CODE_URL, None, Some(body)).await?;
    if status >= 500 {
        return Err(format!("GitHub answered {status}"));
    }
    let code = parse_device_code(&text)?;
    *gh.pending.lock().map_err(|_| "lock")? = Some(code.device_code);
    Ok(DeviceStart {
        user_code: code.user_code,
        verification_uri: code.verification_uri,
        interval: code.interval,
        expires_in: code.expires_in,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollResult {
    /// `pending`, `slow`, `done`, `expired` or `denied`.
    status: &'static str,
    /// Who signed in, when `done`.
    login: Option<String>,
}

fn status_only(status: &'static str) -> PollResult {
    PollResult {
        status,
        login: None,
    }
}

/// Ask whether the person has said yes yet. On yes the token is kept and syncing goes through GitHub.
#[tauri::command]
pub async fn sync_github_poll<R: Runtime>(
    app: AppHandle<R>,
    gh: State<'_, GithubState>,
    sync: State<'_, SyncState>,
) -> Result<PollResult, String> {
    let id = client_id().ok_or("this build has no GitHub sign-in")?;
    let device = gh
        .pending
        .lock()
        .map_err(|_| "lock")?
        .clone()
        .ok_or("no sign-in is waiting")?;
    let body = json!({
        "client_id": id,
        "device_code": device,
        "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
    });
    let (_, text) = send(reqwest::Method::POST, TOKEN_URL, None, Some(body)).await?;
    match parse_poll(&text) {
        Poll::Pending => Ok(status_only("pending")),
        Poll::SlowDown => Ok(status_only("slow")),
        Poll::Expired => {
            *gh.pending.lock().map_err(|_| "lock")? = None;
            Ok(status_only("expired"))
        }
        Poll::Denied => {
            *gh.pending.lock().map_err(|_| "lock")? = None;
            Ok(status_only("denied"))
        }
        Poll::Failed(e) => Err(e),
        Poll::Done(token) => {
            *gh.pending.lock().map_err(|_| "lock")? = None;
            vault::save(&app, &token)?;
            *gh.token.lock().map_err(|_| "lock")? = Some(token.clone());
            *gh.gist.lock().map_err(|_| "lock")? = None;
            sync.use_github();
            // Who it is, for showing; failing to ask is not a reason to fail the sign-in.
            let login = match send(
                reqwest::Method::GET,
                &format!("{API}/user"),
                Some(&token),
                None,
            )
            .await
            {
                Ok((200, body)) => serde_json::from_str::<Value>(&body)
                    .ok()
                    .and_then(|v| v["login"].as_str().map(str::to_string)),
                _ => None,
            };
            Ok(PollResult {
                status: "done",
                login,
            })
        }
    }
}

/// Carry on syncing through GitHub at start-up, if this computer is still signed in.
#[tauri::command]
pub fn sync_github_resume<R: Runtime>(
    app: AppHandle<R>,
    gh: State<'_, GithubState>,
    sync: State<'_, SyncState>,
) -> bool {
    let signed_in = token(&app, &gh).is_some();
    if signed_in {
        sync.use_github();
    }
    signed_in
}

/// Forget the token and stop syncing through GitHub.
#[tauri::command]
pub fn sync_github_sign_out<R: Runtime>(
    app: AppHandle<R>,
    gh: State<'_, GithubState>,
    sync: State<'_, SyncState>,
) {
    forget_token(&app, &gh);
    sync.stop();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_code_github_hands_out() {
        let ok = r#"{"device_code":"dc","user_code":"WDJB-MJHT","verification_uri":"https://github.com/login/device","expires_in":900,"interval":5}"#;
        assert_eq!(
            parse_device_code(ok).unwrap(),
            DeviceCode {
                device_code: "dc".into(),
                user_code: "WDJB-MJHT".into(),
                verification_uri: "https://github.com/login/device".into(),
                expires_in: 900,
                interval: 5,
            }
        );
        assert!(parse_device_code("nope").is_err());
        assert!(parse_device_code(r#"{"error":"device_flow_disabled"}"#)
            .unwrap_err()
            .contains("not switched on"));
        assert!(parse_device_code(r#"{"user_code":"X"}"#).is_err());
    }

    #[test]
    fn reads_each_answer_to_the_waiting() {
        assert_eq!(
            parse_poll(r#"{"error":"authorization_pending"}"#),
            Poll::Pending
        );
        assert_eq!(
            parse_poll(r#"{"error":"slow_down","interval":10}"#),
            Poll::SlowDown
        );
        assert_eq!(parse_poll(r#"{"error":"expired_token"}"#), Poll::Expired);
        assert_eq!(parse_poll(r#"{"error":"access_denied"}"#), Poll::Denied);
        assert_eq!(
            parse_poll(r#"{"access_token":"gho_x","token_type":"bearer","scope":"gist"}"#),
            Poll::Done("gho_x".into())
        );
        assert!(matches!(
            parse_poll(r#"{"error":"incorrect_client_credentials"}"#),
            Poll::Failed(_)
        ));
        assert!(matches!(parse_poll("<html>"), Poll::Failed(_)));
    }

    #[test]
    fn finds_only_our_gist() {
        let page = json!([
            { "id": "a", "description": "something else", "files": { "melodesk-sync.json": {} } },
            { "id": "b", "description": DESCRIPTION, "files": { "other.txt": {} } },
            { "id": "c", "description": DESCRIPTION, "files": { "melodesk-sync.json": {} } },
        ]);
        assert_eq!(pick_gist(&page).as_deref(), Some("c"));
        assert_eq!(pick_gist(&json!([])), None);
        assert_eq!(pick_gist(&json!({"message": "Bad credentials"})), None);
    }

    #[test]
    fn reads_the_file_in_a_gist_or_says_where_to_get_it() {
        let inline = json!({ "files": { "melodesk-sync.json": { "content": "{\"a\":1}" } } });
        assert_eq!(gist_file(&inline), GistFile::Text("{\"a\":1}".into()));
        let cut = json!({ "files": { "melodesk-sync.json": { "truncated": true, "raw_url": "https://gist.githubusercontent.com/x" } } });
        assert_eq!(
            gist_file(&cut),
            GistFile::Truncated("https://gist.githubusercontent.com/x".into())
        );
        assert_eq!(gist_file(&json!({ "files": {} })), GistFile::Missing);
    }

    #[test]
    fn makes_a_secret_gist_holding_one_file() {
        let body = create_body("hello");
        assert_eq!(body["public"], json!(false));
        assert_eq!(body["description"], json!(DESCRIPTION));
        assert_eq!(
            body["files"]["melodesk-sync.json"]["content"],
            json!("hello")
        );
        assert!(update_body("x")["description"].is_null());
    }

    #[test]
    fn a_new_update_time_is_a_new_stamp() {
        assert_eq!(
            stamp_of("2026-10-26T10:00:00Z"),
            stamp_of("2026-10-26T10:00:00Z")
        );
        assert_ne!(
            stamp_of("2026-10-26T10:00:00Z"),
            stamp_of("2026-10-26T10:00:01Z")
        );
    }

    #[test]
    fn only_the_gist_permission_is_asked_for() {
        assert_eq!(SCOPE, "gist");
    }
}
