//! Network access for the user's own sources (a Subsonic or Navidrome server, podcast feeds, radio
//! stations). The UI can only reach web addresses that the webview's rules allow, and those are fixed
//! when the app is built; a person's own server cannot be on that list. So fetching goes through here:
//! the UI first says which hosts the user has added (`net_allow`), and only those can be fetched. A
//! page can neither add hosts nor read anything else.
//!
//! Two kinds of thing are fetched: text and files (`net_text`, `net_bytes`, finished things like a
//! song or a feed), and live radio, which never ends and cannot be downloaded first. For radio a tiny
//! server on 127.0.0.1 relays one allowed address to the audio element (`radio_open`).

use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{Runtime, State};
use tauri_plugin_http::reqwest;
use url::Url;

const MAX_TEXT: usize = 5 * 1024 * 1024;
const MAX_FILE: usize = 400 * 1024 * 1024;
const MAX_HOSTS: usize = 128;
const USER_AGENT: &str = concat!("Melodesk/", env!("CARGO_PKG_VERSION"));

#[derive(Default)]
pub struct NetState {
    hosts: Mutex<HashSet<String>>,
    radio: Mutex<Option<Radio>>,
}

struct Radio {
    port: u16,
    routes: Arc<Mutex<HashMap<String, String>>>,
}

/// `host` or `host:port`, lowercase, for a web address (None for anything that is not http or https).
pub fn host_key(url: &Url) -> Option<String> {
    if !matches!(url.scheme(), "http" | "https") || !url.username().is_empty() {
        return None;
    }
    let host = url.host_str()?.to_ascii_lowercase();
    Some(match url.port() {
        Some(p) => format!("{host}:{p}"),
        None => host,
    })
}

/// Whether the user added this address's host. An entry without a port covers any port.
pub fn is_allowed(hosts: &HashSet<String>, url: &Url) -> bool {
    let Some(key) = host_key(url) else {
        return false;
    };
    let bare = url
        .host_str()
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    hosts.contains(&key) || hosts.contains(&bare)
}

fn normalise_hosts(entries: Vec<String>) -> HashSet<String> {
    entries
        .into_iter()
        .map(|e| e.trim().to_ascii_lowercase())
        .filter(|e| !e.is_empty() && e.len() < 256 && !e.contains(['/', '@', ' ']))
        .take(MAX_HOSTS)
        .collect()
}

/// The UI says which hosts the user has added (their server, feeds, stations). Replaces the list.
#[tauri::command]
pub fn net_allow(state: State<'_, NetState>, hosts: Vec<String>) -> Result<(), String> {
    *state.hosts.lock().map_err(|_| "lock poisoned")? = normalise_hosts(hosts);
    Ok(())
}

fn allowed_url(state: &NetState, raw: &str) -> Result<(Url, HashSet<String>), String> {
    let url = Url::parse(raw).map_err(|_| "not a web address")?;
    let hosts = state.hosts.lock().map_err(|_| "lock poisoned")?.clone();
    if !is_allowed(&hosts, &url) {
        return Err("that address is not one you added".into());
    }
    Ok((url, hosts))
}

/// Whether a redirect may lead to this address even though the user did not add its host. Podcast
/// episodes are served through trackers and CDNs the feed does not name, so for those a redirect may go
/// to any public https address. Never to this computer or its network: no `localhost`, no private,
/// loopback or link-local IP addresses, no plain http.
pub fn is_public_https(url: &Url) -> bool {
    use std::net::IpAddr;
    if url.scheme() != "https" || !url.username().is_empty() {
        return false;
    }
    match url.host() {
        Some(url::Host::Domain(d)) => {
            let d = d.to_ascii_lowercase();
            d != "localhost"
                && !d.ends_with(".localhost")
                && !d.ends_with(".local")
                && !d.ends_with(".internal")
                && d.contains('.')
        }
        Some(url::Host::Ipv4(ip)) => is_public_ip(IpAddr::V4(ip)),
        Some(url::Host::Ipv6(ip)) => is_public_ip(IpAddr::V6(ip)),
        None => false,
    }
}

fn is_public_ip(ip: std::net::IpAddr) -> bool {
    use std::net::IpAddr;
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            !(v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_broadcast()
                || v4.is_documentation()
                || o[0] == 0
                || (o[0] == 100 && (64..128).contains(&o[1])))
        }
        IpAddr::V6(v6) => {
            let s = v6.segments();
            !(v6.is_loopback()
                || v6.is_unspecified()
                || (s[0] & 0xfe00) == 0xfc00
                || (s[0] & 0xffc0) == 0xfe80
                || v6.to_ipv4_mapped().is_some())
        }
    }
}

/// A client that follows redirects only to hosts the user added (or, if `open_redirects`, to public
/// https addresses), and gives up after a while.
fn client(
    hosts: HashSet<String>,
    timeout: Duration,
    open_redirects: bool,
) -> Result<reqwest::Client, String> {
    let policy = reqwest::redirect::Policy::custom(move |attempt| {
        if attempt.previous().len() >= 8 {
            attempt.error("too many redirects")
        } else if is_allowed(&hosts, attempt.url())
            || (open_redirects && is_public_https(attempt.url()))
        {
            attempt.follow()
        } else {
            attempt.error("redirected to a host you did not add")
        }
    });
    reqwest::Client::builder()
        .redirect(policy)
        .timeout(timeout)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())
}

async fn fetch(
    url: &str,
    state: &NetState,
    limit: usize,
    timeout: Duration,
    open_redirects: bool,
) -> Result<Vec<u8>, String> {
    let (url, hosts) = allowed_url(state, url)?;
    let mut response = client(hosts, timeout, open_redirects)?
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "the server answered {}",
            response.status().as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|n| n as usize > limit)
    {
        return Err("that file is too large".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if body.len() + chunk.len() > limit {
            return Err("that file is too large".into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

/// A page, feed or API answer as text.
#[tauri::command]
pub async fn net_text(state: State<'_, NetState>, url: String) -> Result<String, String> {
    let bytes = fetch(&url, &state, MAX_TEXT, Duration::from_secs(20), false).await?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// A file (a song, a cover, an episode), for the UI to play or show.
#[tauri::command]
pub async fn net_bytes<R: Runtime>(
    _app: tauri::AppHandle<R>,
    state: State<'_, NetState>,
    url: String,
    open_redirects: Option<bool>,
) -> Result<tauri::ipc::Response, String> {
    let bytes = fetch(
        &url,
        &state,
        MAX_FILE,
        Duration::from_secs(300),
        open_redirects.unwrap_or(false),
    )
    .await?;
    Ok(tauri::ipc::Response::new(bytes))
}

// --- live radio ---------------------------------------------------------------------------------

/// The id in `/r/<id>`, if the request line is a GET for one.
pub fn radio_id(request_line: &str) -> Option<&str> {
    let mut parts = request_line.split(' ');
    if parts.next()? != "GET" {
        return None;
    }
    let path = parts.next()?.split('?').next()?;
    let id = path.strip_prefix("/r/")?;
    (id.len() == 32 && id.bytes().all(|b| b.is_ascii_hexdigit())).then_some(id)
}

fn random_id() -> String {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    // Nothing valuable hides behind the address (it only relays a station the user added); it only has
    // to be something nobody hits by accident. `RandomState` is seeded by the system's randomness.
    let part = |salt: u64| {
        let mut hasher = RandomState::new().build_hasher();
        hasher.write_u64(salt);
        hasher.finish()
    };
    format!("{:016x}{:016x}", part(1), part(2))
}

/// Serve one connection: look the station up (it was checked when the route was made) and relay it.
fn relay(mut stream: TcpStream, routes: &Arc<Mutex<HashMap<String, String>>>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buf = [0u8; 4096];
    let Ok(n) = stream.read(&mut buf) else { return };
    let head = String::from_utf8_lossy(&buf[..n]).into_owned();
    let line = head.lines().next().unwrap_or("");
    let fail = |stream: &mut TcpStream, status: &str| {
        let _ = stream.write_all(
            format!("HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                .as_bytes(),
        );
    };
    let Some(id) = radio_id(line) else {
        fail(&mut stream, "404 Not Found");
        return;
    };
    let upstream = routes.lock().ok().and_then(|r| r.get(id).cloned());
    let Some(raw) = upstream else {
        fail(&mut stream, "404 Not Found");
        return;
    };
    let Ok(url) = Url::parse(&raw) else {
        fail(&mut stream, "404 Not Found");
        return;
    };
    let result: Result<(), String> = tauri::async_runtime::block_on(async {
        // No overall timeout: radio does not end. Only the wait for the first answer is limited.
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(3))
            .connect_timeout(Duration::from_secs(10))
            .user_agent(USER_AGENT)
            .build()
            .map_err(|e| e.to_string())?;
        let mut response = client.get(url).send().await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("{}", response.status().as_u16()));
        }
        let kind = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .filter(|v| v.starts_with("audio/") || v.starts_with("application/ogg"))
            .unwrap_or("audio/mpeg")
            .to_string();
        stream
            .write_all(
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: {kind}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
                )
                .as_bytes(),
            )
            .map_err(|e| e.to_string())?;
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            // The audio element went away (another station, or stop): stop relaying.
            stream.write_all(&chunk).map_err(|e| e.to_string())?;
        }
        Ok(())
    });
    if result.is_err() {
        fail(&mut stream, "502 Bad Gateway");
    }
}

/// An address on this computer that plays the live station at `url` (which the user added). The audio
/// element plays that address; closing the connection ends the relay.
#[tauri::command]
pub fn radio_open(state: State<'_, NetState>, url: String) -> Result<String, String> {
    let (parsed, _) = allowed_url(&state, &url)?;
    let mut slot = state.radio.lock().map_err(|_| "lock poisoned")?;
    if slot.is_none() {
        let listener = TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, 0)))
            .map_err(|e| format!("could not start the radio relay: {e}"))?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let routes: Arc<Mutex<HashMap<String, String>>> = Arc::default();
        let accept_routes = routes.clone();
        thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let routes = accept_routes.clone();
                thread::spawn(move || relay(stream, &routes));
            }
        });
        *slot = Some(Radio { port, routes });
    }
    let radio = slot.as_ref().ok_or("no relay")?;
    let id = random_id();
    {
        let mut routes = radio.routes.lock().map_err(|_| "lock poisoned")?;
        // Keep the table small: a person plays a handful of stations in a session.
        if routes.len() > 64 {
            routes.clear();
        }
        routes.insert(id.clone(), parsed.to_string());
    }
    Ok(format!("http://127.0.0.1:{}/r/{id}", radio.port))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    fn hosts(entries: &[&str]) -> HashSet<String> {
        normalise_hosts(entries.iter().map(|s| s.to_string()).collect())
    }

    #[test]
    fn only_added_hosts_are_allowed() {
        let h = hosts(&["music.example.com", "radio.example.org:8000"]);
        assert!(is_allowed(
            &h,
            &url("https://music.example.com/rest/ping.view")
        ));
        assert!(is_allowed(&h, &url("http://MUSIC.example.com:4533/x")));
        assert!(is_allowed(&h, &url("http://radio.example.org:8000/live")));
        // A host with a port entry is that port only.
        assert!(!is_allowed(&h, &url("http://radio.example.org:9000/live")));
        assert!(!is_allowed(&h, &url("https://evil.example.com/")));
        assert!(!is_allowed(
            &h,
            &url("https://music.example.com.evil.test/")
        ));
    }

    #[test]
    fn only_web_addresses_without_logins_are_allowed() {
        let h = hosts(&["music.example.com"]);
        assert!(!is_allowed(&h, &url("file:///etc/passwd")));
        assert!(!is_allowed(&h, &url("ftp://music.example.com/x")));
        assert!(!is_allowed(&h, &url("https://user:pw@music.example.com/")));
        assert!(!is_allowed(
            &HashSet::new(),
            &url("https://music.example.com/")
        ));
    }

    #[test]
    fn open_redirects_stop_at_public_https() {
        for ok in [
            "https://cdn.example.com/ep.mp3",
            "https://traffic.megaphone.fm/x.mp3?updated=1",
            "https://93.184.216.34/x",
        ] {
            assert!(is_public_https(&url(ok)), "{ok}");
        }
        for no in [
            "http://cdn.example.com/ep.mp3",
            "https://localhost/x",
            "https://printer.local/x",
            "https://thing.internal/x",
            "https://intranet/x",
            "https://127.0.0.1/x",
            "https://10.0.0.5/x",
            "https://192.168.1.1/x",
            "https://172.16.0.9/x",
            "https://169.254.169.254/latest/meta-data",
            "https://0.0.0.0/x",
            "https://100.64.0.1/x",
            "https://[::1]/x",
            "https://[fd00::1]/x",
            "https://[fe80::1]/x",
            "https://user:pw@cdn.example.com/x",
            "file:///etc/passwd",
        ] {
            assert!(!is_public_https(&url(no)), "{no}");
        }
    }

    #[test]
    fn host_entries_are_cleaned() {
        let h = hosts(&[" Music.Example.COM ", "", "a/b", "me@x", "has space"]);
        assert_eq!(h, HashSet::from(["music.example.com".to_string()]));
        let many: Vec<String> = (0..500).map(|i| format!("h{i}.test")).collect();
        assert_eq!(normalise_hosts(many).len(), MAX_HOSTS);
    }

    #[test]
    fn reads_the_station_id_of_a_relay_request() {
        let id = "0123456789abcdef0123456789abcdef";
        assert_eq!(radio_id(&format!("GET /r/{id} HTTP/1.1")), Some(id));
        assert_eq!(radio_id(&format!("GET /r/{id}?x=1 HTTP/1.1")), Some(id));
        assert_eq!(radio_id(&format!("POST /r/{id} HTTP/1.1")), None);
        assert_eq!(radio_id("GET /r/short HTTP/1.1"), None);
        assert_eq!(radio_id(&format!("GET /x/{id} HTTP/1.1")), None);
        assert_eq!(
            radio_id("GET /r/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz HTTP/1.1"),
            None
        );
    }

    #[test]
    fn route_ids_are_long_and_do_not_repeat() {
        let a = random_id();
        let b = random_id();
        assert_eq!(a.len(), 32);
        assert!(a.bytes().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }
}
