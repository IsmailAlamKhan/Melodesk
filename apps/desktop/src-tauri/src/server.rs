//! Settings sync through the Melodesk sync server (`apps/sync-server`, which runs on Vercel). The app
//! encrypts the settings before they get here, with a key made from a *sync code* that only the person's
//! computers know, so all this module does is move opaque text to and from the server under an id.
//! It holds the sync code in the keychain (see `vault.rs`) and hands it to the UI only when the person
//! asks to see it or this computer starts up.
//!
//! Only the address the person (or the build) gave can be reached, and only over https (a program on
//! this computer, `localhost`, may use http, for trying a server out).

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_http::reqwest;
use url::Url;

use crate::vault;

/// The address of the server this build uses unless the person types another, set when it is built.
const DEFAULT_URL: Option<&str> = option_env!("MELODESK_SYNC_URL");
/// What the code is called in the keychain.
const CODE_NAME: &str = "sync-server-code";
const USER_AGENT: &str = concat!("Melodesk/", env!("CARGO_PKG_VERSION"));
const MAX_ANSWER: usize = 2_000_000;

#[derive(Default)]
pub struct ServerState {
    base: Mutex<Option<String>>,
}

/// A server address we are willing to talk to, without a trailing slash.
pub fn normalize_url(text: &str) -> Result<String, String> {
    let url = Url::parse(text.trim()).map_err(|_| "that is not a web address")?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    let ok_scheme = url.scheme() == "https" || (url.scheme() == "http" && local);
    if !ok_scheme {
        return Err("the server address must start with https://".into());
    }
    if !url.username().is_empty() || url.password().is_some() || url.host_str().is_none() {
        return Err("that is not a server address".into());
    }
    let mut base = url.origin().ascii_serialization();
    let path = url.path().trim_end_matches('/');
    if !path.is_empty() {
        base.push_str(path);
    }
    Ok(base)
}

/// The sync code with the dashes and case taken out, if it is one: 20 letters and digits from the
/// base-32 alphabet (A-Z, 2-7).
pub fn normalize_code(text: &str) -> Option<String> {
    let code: String = text
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| c.to_ascii_uppercase())
        .collect();
    (code.len() == 20
        && code
            .chars()
            .all(|c| c.is_ascii_uppercase() || ('2'..='7').contains(&c)))
    .then_some(code)
}

fn valid_id(id: &str) -> bool {
    id.len() == 64
        && id
            .chars()
            .all(|c| c.is_ascii_digit() || ('a'..='f').contains(&c))
}

#[derive(Debug, PartialEq, Eq, Serialize)]
pub struct Blob {
    version: u64,
    data: String,
}

pub fn parse_blob(text: &str) -> Result<Blob, String> {
    let v: Value =
        serde_json::from_str(text).map_err(|_| "the server answered something unexpected")?;
    match (v["version"].as_u64(), v["data"].as_str()) {
        (Some(version), Some(data)) => Ok(Blob {
            version,
            data: data.to_string(),
        }),
        _ => Err("the server answered something unexpected".into()),
    }
}

fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())
}

fn base(state: &ServerState) -> Result<String, String> {
    state
        .base
        .lock()
        .map_err(|_| "lock")?
        .clone()
        .ok_or_else(|| "no sync server chosen".to_string())
}

async fn request(
    method: reqwest::Method,
    url: String,
    body: Option<Value>,
) -> Result<(u16, Option<u64>, String), String> {
    let mut req = http()?.request(method, url);
    if let Some(b) = body {
        req = req
            .header("Content-Type", "application/json")
            .body(b.to_string());
    }
    let res = req
        .send()
        .await
        .map_err(|e| format!("cannot reach the sync server: {e}"))?;
    let status = res.status().as_u16();
    let version = res
        .headers()
        .get("x-version")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok());
    let text = res.text().await.map_err(|e| e.to_string())?;
    if text.len() > MAX_ANSWER {
        return Err("the server sent too much".into());
    }
    Ok((status, version, text))
}

/// The server address built into this app, if there is one.
#[tauri::command]
pub fn sync_server_default() -> Option<String> {
    DEFAULT_URL.and_then(|u| normalize_url(u).ok())
}

/// Is there a Melodesk sync server at this address? Returns the address as it will be used.
#[tauri::command]
pub async fn sync_server_check(url: String) -> Result<String, String> {
    let base = normalize_url(&url)?;
    let (status, _, text) =
        request(reqwest::Method::GET, format!("{base}/api/v1/health"), None).await?;
    let ok = status == 200
        && serde_json::from_str::<Value>(&text)
            .map(|v| v["name"] == "melodesk-sync")
            .unwrap_or(false);
    if ok {
        Ok(base)
    } else {
        Err("there is no Melodesk sync server at that address".into())
    }
}

/// Use this server. With a `code` (a new one made here, or one typed from another computer) it is saved
/// in the keychain; without, the saved one is used. Returns the code, normalized, for the UI to derive
/// its keys from.
#[tauri::command]
pub fn sync_server_use<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ServerState>,
    url: String,
    code: Option<String>,
) -> Result<String, String> {
    let base = normalize_url(&url)?;
    let code = match code {
        Some(text) => {
            let code = normalize_code(&text).ok_or("bad-code")?;
            vault::save(&app, CODE_NAME, &code)?;
            code
        }
        None => vault::load(&app, CODE_NAME).ok_or("no-code")?,
    };
    *state.base.lock().map_err(|_| "lock")? = Some(base);
    Ok(code)
}

/// What is saved under this id (None if nothing is yet).
#[tauri::command]
pub async fn sync_server_get(
    state: State<'_, ServerState>,
    id: String,
) -> Result<Option<Blob>, String> {
    if !valid_id(&id) {
        return Err("bad id".into());
    }
    let url = format!("{}/api/v1/blob/{id}", base(&state)?);
    let (status, _, text) = request(reqwest::Method::GET, url, None).await?;
    match status {
        200 => parse_blob(&text).map(Some),
        404 => Ok(None),
        other => Err(format!("the sync server answered {other}")),
    }
}

#[derive(Serialize)]
pub struct Saved {
    ok: bool,
    version: u64,
}

/// Save `data` under this id, if it is still at `if_version` (0 = not there yet). `ok: false` means
/// another computer got there first; `version` is where things stand.
#[tauri::command]
pub async fn sync_server_put(
    state: State<'_, ServerState>,
    id: String,
    data: String,
    if_version: Option<u64>,
) -> Result<Saved, String> {
    if !valid_id(&id) {
        return Err("bad id".into());
    }
    let url = format!("{}/api/v1/blob/{id}", base(&state)?);
    let (status, _, text) = request(
        reqwest::Method::PUT,
        url,
        Some(json!({ "data": data, "ifVersion": if_version })),
    )
    .await?;
    let version = serde_json::from_str::<Value>(&text)
        .ok()
        .and_then(|v| v["version"].as_u64())
        .unwrap_or(0);
    match status {
        200 => Ok(Saved { ok: true, version }),
        409 => Ok(Saved { ok: false, version }),
        other => Err(format!("the sync server answered {other}")),
    }
}

/// Where this id stands, without fetching it (None if nothing is saved).
#[tauri::command]
pub async fn sync_server_version(
    state: State<'_, ServerState>,
    id: String,
) -> Result<Option<u64>, String> {
    if !valid_id(&id) {
        return Err("bad id".into());
    }
    let url = format!("{}/api/v1/blob/{id}", base(&state)?);
    let (status, version, _) = request(reqwest::Method::HEAD, url, None).await?;
    match status {
        200 => Ok(version),
        404 => Ok(None),
        other => Err(format!("the sync server answered {other}")),
    }
}

/// Stop using the server and forget the code on this computer.
#[tauri::command]
pub fn sync_server_forget<R: Runtime>(app: AppHandle<R>, state: State<'_, ServerState>) {
    vault::clear(&app, CODE_NAME);
    if let Ok(mut b) = state.base.lock() {
        *b = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_addresses_are_https_without_trimmings() {
        assert_eq!(
            normalize_url(" https://sync.example.com/ ").unwrap(),
            "https://sync.example.com"
        );
        assert_eq!(
            normalize_url("https://x.vercel.app/prefix/").unwrap(),
            "https://x.vercel.app/prefix"
        );
        assert_eq!(
            normalize_url("http://localhost:3000").unwrap(),
            "http://localhost:3000"
        );
        for bad in [
            "http://example.com",
            "ftp://example.com",
            "https://user:pw@example.com",
            "example.com",
            "",
            "file:///etc/passwd",
        ] {
            assert!(normalize_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_sync_code_is_twenty_base32_characters_however_it_is_typed() {
        assert_eq!(
            normalize_code("abcd-efgh-ijkl-mnop-qrst").as_deref(),
            Some("ABCDEFGHIJKLMNOPQRST")
        );
        assert_eq!(
            normalize_code(" ABCD EFGH IJKL MNOP 2345 ").as_deref(),
            Some("ABCDEFGHIJKLMNOP2345")
        );
        for bad in [
            "",
            "ABCD",
            "ABCD-EFGH-IJKL-MNOP-QRS1",
            "ABCD-EFGH-IJKL-MNOP-QRST-UVWX",
            "abcd-efgh-ijkl-mnop-qrs!",
        ] {
            assert!(normalize_code(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn an_id_is_a_sha256_in_hex() {
        assert!(valid_id(&"a".repeat(64)));
        assert!(!valid_id(&"A".repeat(64)));
        assert!(!valid_id("../../etc"));
        assert!(!valid_id(&"a".repeat(63)));
    }

    #[test]
    fn reads_what_the_server_sends_back() {
        assert_eq!(
            parse_blob(r#"{"version":3,"data":"cipher"}"#).unwrap(),
            Blob {
                version: 3,
                data: "cipher".into()
            }
        );
        assert!(parse_blob("<html>").is_err());
        assert!(parse_blob(r#"{"version":"3"}"#).is_err());
    }
}
