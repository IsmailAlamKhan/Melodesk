//! A small control API on this computer, for other programs (a Stream Deck, Home Assistant, a script):
//! ask what is playing, play, pause, skip, set the volume. It is off until the user switches it on in
//! Settings, listens on 127.0.0.1 only, and answers only requests that carry the secret token.
//!
//! It is plain HTTP written against `std::net`, a few hundred lines, with no dependency: requests are
//! small and the surface is tiny. Browsers cannot use it by accident: a request from a web page carries
//! an `Origin` header (refused), and without the token nothing is done.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Manager, Runtime, State};

use crate::player::{self, PlayerCommand};

const MAX_HEAD: usize = 8 * 1024;
const MAX_BODY: usize = 1024;
const MIN_TOKEN: usize = 16;

#[derive(Default)]
pub struct ControlState {
    /// Set to stop the running server; None when it is off.
    stop: Mutex<Option<Arc<AtomicBool>>>,
}

/// What the API tells a caller about what is playing.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct NowInfo {
    pub source: &'static str,
    pub title: String,
    pub artist: String,
    pub playing: bool,
    pub video_id: Option<String>,
}

#[derive(Debug)]
pub struct Request {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

#[derive(Debug)]
pub struct Reply {
    pub status: u16,
    pub body: String,
    /// What to do, once the reply has been decided.
    pub command: Option<PlayerCommand>,
}

fn reply(status: u16, body: serde_json::Value) -> Reply {
    Reply {
        status,
        body: body.to_string(),
        command: None,
    }
}

fn error(status: u16, message: &str) -> Reply {
    reply(status, json!({ "error": message }))
}

/// Whether two byte strings are equal, taking the same time wherever they differ.
fn same_secret(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    let mut diff = (a.len() ^ b.len()) as u8;
    for i in 0..a.len().max(b.len()) {
        diff |= a.get(i).copied().unwrap_or(0) ^ b.get(i).copied().unwrap_or(0);
    }
    diff == 0
}

/// Decide what a request gets. No I/O: the caller sends the reply and runs the command.
pub fn route(req: &Request, token: &str, port: u16, now: &NowInfo) -> Reply {
    // A page in a browser always sends Origin; a program does not. Refuse the former outright.
    if req.headers.contains_key("origin") {
        return error(403, "browsers are not allowed");
    }
    let host = req.headers.get("host").map(String::as_str).unwrap_or("");
    let ok_host = [format!("127.0.0.1:{port}"), format!("localhost:{port}")];
    if !ok_host.iter().any(|h| h.eq_ignore_ascii_case(host)) {
        return error(403, "unexpected host");
    }
    let given = req
        .headers
        .get("authorization")
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    if !same_secret(given, token) {
        return error(401, "missing or wrong token");
    }
    let command = |c: PlayerCommand| Reply {
        status: 200,
        body: json!({ "ok": true }).to_string(),
        command: Some(c),
    };
    match (req.method.as_str(), req.path.as_str()) {
        ("GET", "/v1/now") => reply(
            200,
            json!({
                "source": now.source,
                "title": now.title,
                "artist": now.artist,
                "playing": now.playing,
                "videoId": now.video_id,
            }),
        ),
        ("POST", "/v1/play") => command(PlayerCommand::Play),
        ("POST", "/v1/pause") => command(PlayerCommand::Pause),
        ("POST", "/v1/toggle") => command(PlayerCommand::Toggle),
        ("POST", "/v1/next") => command(PlayerCommand::Next),
        ("POST", "/v1/previous") => command(PlayerCommand::Previous),
        ("POST", "/v1/mute") => command(PlayerCommand::ToggleMute),
        ("POST", "/v1/volume") => {
            let volume = serde_json::from_slice::<serde_json::Value>(&req.body)
                .ok()
                .and_then(|v| v.get("volume").and_then(|n| n.as_f64()));
            match volume {
                Some(v) if (0.0..=1.0).contains(&v) => {
                    command(PlayerCommand::SetVolume { volume: v })
                }
                _ => error(400, "send {\"volume\": 0..1}"),
            }
        }
        (
            _,
            "/v1/now" | "/v1/play" | "/v1/pause" | "/v1/toggle" | "/v1/next" | "/v1/previous"
            | "/v1/mute" | "/v1/volume",
        ) => error(405, "wrong method"),
        _ => error(404, "no such endpoint"),
    }
}

/// Parse the start of an HTTP/1.x request. Err carries the status to answer with.
pub fn parse_request(raw: &[u8]) -> Result<(Request, usize), u16> {
    let head_end = raw
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or(400u16)?;
    let head = std::str::from_utf8(&raw[..head_end]).map_err(|_| 400u16)?;
    let mut lines = head.split("\r\n");
    let start = lines.next().ok_or(400u16)?;
    let mut parts = start.split(' ');
    let method = parts.next().ok_or(400u16)?.to_string();
    let target = parts.next().ok_or(400u16)?;
    if !parts.next().is_some_and(|v| v.starts_with("HTTP/1.")) {
        return Err(400);
    }
    let path = target.split('?').next().unwrap_or("").to_string();
    let mut headers = HashMap::new();
    for line in lines {
        let (name, value) = line.split_once(':').ok_or(400u16)?;
        headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
    }
    let length = match headers.get("content-length") {
        Some(v) => v.parse::<usize>().map_err(|_| 400u16)?,
        None => 0,
    };
    if length > MAX_BODY {
        return Err(413);
    }
    let body_start = head_end + 4;
    Ok((
        Request {
            method,
            path,
            headers,
            body: raw.get(body_start..).unwrap_or(&[]).to_vec(),
        },
        length,
    ))
}

fn status_text(status: u16) -> &'static str {
    match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Payload Too Large",
        _ => "Error",
    }
}

fn write_reply(stream: &mut TcpStream, status: u16, body: &str) {
    let text = format!(
        "HTTP/1.1 {status} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        status_text(status),
        body.len()
    );
    let _ = stream.write_all(text.as_bytes());
}

/// Read one request: the head, then as much body as it says it has (and no more than we allow).
fn read_request(stream: &mut TcpStream) -> Result<Request, u16> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];
    loop {
        let n = stream.read(&mut chunk).map_err(|_| 408u16)?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        if buf.len() > MAX_HEAD + MAX_BODY {
            return Err(413);
        }
        if let Some(head_end) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            let (req, length) = parse_request(&buf)?;
            if buf.len() >= head_end + 4 + length {
                return Ok(Request {
                    body: buf[head_end + 4..head_end + 4 + length].to_vec(),
                    ..req
                });
            }
        } else if buf.len() > MAX_HEAD {
            return Err(413);
        }
    }
    parse_request(&buf).map(|(r, _)| r)
}

fn now_info<R: Runtime>(app: &AppHandle<R>) -> NowInfo {
    let np = app
        .try_state::<crate::native::NativeState<R>>()
        .and_then(|s| s.now_playing.lock().ok().map(|n| n.clone()))
        .unwrap_or_default();
    NowInfo {
        source: if crate::local::is_active(app) {
            "local"
        } else {
            "youtube"
        },
        title: np.title,
        artist: np.artist,
        playing: np.playing,
        video_id: np.video_id,
    }
}

fn serve<R: Runtime>(
    listener: TcpListener,
    app: AppHandle<R>,
    token: String,
    port: u16,
    stop: Arc<AtomicBool>,
) {
    while !stop.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
                match read_request(&mut stream) {
                    Ok(req) => {
                        let r = route(&req, &token, port, &now_info(&app));
                        write_reply(&mut stream, r.status, &r.body);
                        if let Some(command) = r.command {
                            player::dispatch(&app, command);
                        }
                    }
                    Err(status) => write_reply(
                        &mut stream,
                        status,
                        &json!({ "error": "bad request" }).to_string(),
                    ),
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(60));
            }
            Err(_) => thread::sleep(Duration::from_millis(200)),
        }
    }
}

fn stop_running(state: &ControlState) {
    if let Ok(mut slot) = state.stop.lock() {
        if let Some(flag) = slot.take() {
            flag.store(true, Ordering::Relaxed);
        }
    }
}

/// Turn the API on, on `port`, with `token` (at least 16 characters). Replaces a running one.
#[tauri::command]
pub fn control_start<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ControlState>,
    port: u16,
    token: String,
) -> Result<(), String> {
    if token.len() < MIN_TOKEN {
        return Err("the token is too short".into());
    }
    if port < 1024 {
        return Err("choose a port from 1024 up".into());
    }
    stop_running(&state);
    let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, port)))
        .map_err(|e| format!("could not listen on port {port}: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let stop = Arc::new(AtomicBool::new(false));
    *state.stop.lock().map_err(|_| "lock poisoned")? = Some(stop.clone());
    thread::spawn(move || serve(listener, app, token, port, stop));
    Ok(())
}

#[tauri::command]
pub fn control_stop(state: State<'_, ControlState>) {
    stop_running(&state);
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "0123456789abcdef-secret";

    fn request(method: &str, path: &str, headers: &[(&str, &str)], body: &str) -> Request {
        let mut h: HashMap<String, String> = headers
            .iter()
            .map(|(k, v)| (k.to_ascii_lowercase(), v.to_string()))
            .collect();
        h.entry("host".into()).or_insert("127.0.0.1:7733".into());
        h.entry("authorization".into())
            .or_insert(format!("Bearer {TOKEN}"));
        Request {
            method: method.into(),
            path: path.into(),
            headers: h,
            body: body.as_bytes().to_vec(),
        }
    }

    fn now() -> NowInfo {
        NowInfo {
            source: "local",
            title: "Song".into(),
            artist: "Artist".into(),
            playing: true,
            video_id: Some("local:3".into()),
        }
    }

    fn go(req: &Request) -> Reply {
        route(req, TOKEN, 7733, &now())
    }

    /// The command a reply asks for, as JSON (the commands are compared by what they send).
    fn asks(r: &Reply) -> Option<serde_json::Value> {
        r.command.as_ref().map(|c| serde_json::to_value(c).unwrap())
    }

    #[test]
    fn answers_what_is_playing() {
        let r = go(&request("GET", "/v1/now", &[], ""));
        assert_eq!(r.status, 200);
        let v: serde_json::Value = serde_json::from_str(&r.body).unwrap();
        assert_eq!(v["title"], "Song");
        assert_eq!(v["source"], "local");
        assert_eq!(v["playing"], true);
        assert!(r.command.is_none());
    }

    #[test]
    fn controls_playback() {
        for (path, expected) in [
            ("/v1/play", "play"),
            ("/v1/pause", "pause"),
            ("/v1/toggle", "toggle"),
            ("/v1/next", "next"),
            ("/v1/previous", "previous"),
            ("/v1/mute", "toggleMute"),
        ] {
            let r = go(&request("POST", path, &[], ""));
            assert_eq!(r.status, 200, "{path}");
            assert_eq!(asks(&r), Some(json!({ "type": expected })), "{path}");
        }
        let r = go(&request("POST", "/v1/volume", &[], "{\"volume\":0.4}"));
        assert_eq!(
            asks(&r),
            Some(json!({ "type": "setVolume", "volume": 0.4 }))
        );
    }

    #[test]
    fn refuses_a_bad_volume() {
        for body in [
            "",
            "{}",
            "{\"volume\":2}",
            "{\"volume\":-0.1}",
            "{\"volume\":\"loud\"}",
            "nope",
        ] {
            let r = go(&request("POST", "/v1/volume", &[], body));
            assert_eq!(r.status, 400, "{body}");
            assert!(r.command.is_none());
        }
    }

    #[test]
    fn needs_the_token() {
        for header in ["Bearer wrong-token-value", "Bearer ", "Basic abc", ""] {
            let r = go(&request(
                "POST",
                "/v1/next",
                &[("Authorization", header)],
                "",
            ));
            assert_eq!(r.status, 401, "{header}");
            assert!(r.command.is_none());
        }
        let mut no_auth = request("POST", "/v1/next", &[], "");
        no_auth.headers.remove("authorization");
        assert_eq!(go(&no_auth).status, 401);
    }

    #[test]
    fn keeps_web_pages_and_other_hosts_out() {
        let page = go(&request(
            "POST",
            "/v1/next",
            &[("Origin", "https://evil.example")],
            "",
        ));
        assert_eq!(page.status, 403);
        assert!(page.command.is_none());
        // DNS rebinding: the page reaches us under its own name.
        let rebinding = go(&request(
            "POST",
            "/v1/next",
            &[("Host", "evil.example:7733")],
            "",
        ));
        assert_eq!(rebinding.status, 403);
        let other_port = go(&request(
            "POST",
            "/v1/next",
            &[("Host", "127.0.0.1:9999")],
            "",
        ));
        assert_eq!(other_port.status, 403);
        assert_eq!(
            go(&request(
                "GET",
                "/v1/now",
                &[("Host", "localhost:7733")],
                ""
            ))
            .status,
            200
        );
    }

    #[test]
    fn rejects_wrong_methods_and_unknown_paths() {
        assert_eq!(go(&request("GET", "/v1/next", &[], "")).status, 405);
        assert_eq!(go(&request("POST", "/v1/now", &[], "")).status, 405);
        assert_eq!(go(&request("OPTIONS", "/v1/now", &[], "")).status, 405);
        assert_eq!(go(&request("GET", "/v1/other", &[], "")).status, 404);
        assert_eq!(go(&request("GET", "/", &[], "")).status, 404);
    }

    #[test]
    fn compares_secrets_fully() {
        assert!(same_secret("abc", "abc"));
        assert!(!same_secret("abc", "abd"));
        assert!(!same_secret("abc", "abcd"));
        assert!(!same_secret("", "x"));
    }

    #[test]
    fn parses_a_request() {
        let raw = b"POST /v1/volume?x=1 HTTP/1.1\r\nHost: 127.0.0.1:7733\r\nAuthorization: Bearer t\r\nContent-Length: 14\r\n\r\n{\"volume\":0.5}";
        let (req, len) = parse_request(raw).unwrap();
        assert_eq!(req.method, "POST");
        assert_eq!(req.path, "/v1/volume");
        assert_eq!(req.headers["host"], "127.0.0.1:7733");
        assert_eq!(len, 14);
        assert_eq!(req.body, b"{\"volume\":0.5}");
    }

    #[test]
    fn refuses_malformed_and_oversized_requests() {
        assert_eq!(parse_request(b"GET /v1/now HTTP/1.1\r\n").err(), Some(400));
        assert_eq!(parse_request(b"NONSENSE\r\n\r\n").err(), Some(400));
        assert_eq!(parse_request(b"GET / SPDY/3\r\n\r\n").err(), Some(400));
        assert_eq!(
            parse_request(b"GET / HTTP/1.1\r\nbroken header\r\n\r\n").err(),
            Some(400)
        );
        assert_eq!(
            parse_request(b"POST / HTTP/1.1\r\nContent-Length: 99999\r\n\r\n").err(),
            Some(413)
        );
        assert_eq!(
            parse_request(b"POST / HTTP/1.1\r\nContent-Length: abc\r\n\r\n").err(),
            Some(400)
        );
    }
}
