//! The player window: a webview that loads the official YouTube Music web app with our
//! bridge script injected, plus the three IPC commands that connect it to the UI window.
//!
//! Trust model:
//! * The UI window (`main`, our own code) may send typed [`PlayerCommand`]s. They are
//!   deserialised by serde, so anything malformed never reaches `eval`.
//! * The player window (`player`, Google's code plus our bridge) may only call
//!   [`bridge_emit`]. Its payload is forwarded to the UI as opaque JSON and validated there.
//!   Nothing else is reachable from that webview (see `capabilities/player.json`).

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent,
};

pub const PLAYER_LABEL: &str = "player";
pub const MAIN_LABEL: &str = "main";
const PLAYER_URL: &str = "https://music.youtube.com/";
/// Tauri event name the UI listens on. Must match `BRIDGE_EVENT_CHANNEL` in the bridge protocol.
const BRIDGE_EVENT_CHANNEL: &str = "player:event";
/// Upper bound on a single bridge event payload; anything larger is dropped. InnerTube
/// responses (home feed, long playlists) can run to a few MB.
const MAX_EVENT_BYTES: usize = 16 * 1024 * 1024;

/// Built by `pnpm build:bridge` (packages/bridge → dist/bridge.js) and embedded at compile time.
const BRIDGE_SCRIPT: &str = include_str!("../../../../packages/bridge/dist/bridge.js");

/// Google refuses sign-in from user agents it recognises as embedded webviews, so the player
/// webview presents itself as the platform's mainstream browser. We do not hide that it is a
/// webview from YouTube in any other way.
#[cfg(target_os = "macos")]
const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15";
#[cfg(target_os = "windows")]
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0";
#[cfg(target_os = "linux")]
const USER_AGENT: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

/// Commands the UI may send to the player. Mirrors `PlayerCommandSchema` in
/// `packages/bridge/src/protocol.ts`; keep the two in sync.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum PlayerCommand {
    Play,
    Pause,
    Toggle,
    Next,
    Previous,
    Seek {
        seconds: f64,
    },
    SetVolume {
        volume: f64,
    },
    SetMuted {
        muted: bool,
    },
    Navigate {
        path: String,
    },
    RequestState,
    #[serde(rename_all = "camelCase")]
    Data {
        request_id: String,
        endpoint: String,
        body: serde_json::Map<String, serde_json::Value>,
    },
    Probe,
    Endpoint {
        endpoint: serde_json::Map<String, serde_json::Value>,
        mode: EndpointMode,
    },
    QueueAdd {
        target: QueueTarget,
        position: QueuePosition,
    },
    SetShuffle {
        enabled: bool,
    },
    SetRepeat {
        mode: RepeatMode,
    },
    QueueSelect {
        index: u32,
    },
    QueueRemove {
        index: u32,
    },
    QueueMove {
        from: u32,
        to: u32,
    },
    SetAutoplay {
        enabled: bool,
    },
    SetPlaybackRate {
        rate: f64,
    },
    SetVideoMode {
        video: bool,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueueTarget {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playlist_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QueuePosition {
    Next,
    End,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EndpointMode {
    Navigate,
    Service,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RepeatMode {
    Off,
    All,
    One,
}

impl PlayerCommand {
    fn validate(&self) -> Result<(), PlayerError> {
        match self {
            PlayerCommand::Seek { seconds } if !(seconds.is_finite() && *seconds >= 0.0) => Err(
                PlayerError::InvalidCommand("seek seconds must be a non-negative number"),
            ),
            PlayerCommand::SetVolume { volume }
                if !(volume.is_finite() && (0.0..=1.0).contains(volume)) =>
            {
                Err(PlayerError::InvalidCommand("volume must be within 0..=1"))
            }
            PlayerCommand::Data {
                request_id,
                endpoint,
                ..
            } if request_id.is_empty()
                || request_id.len() > 64
                || !endpoint.split('/').all(|seg| {
                    !seg.is_empty() && seg.chars().all(|c| c.is_ascii_lowercase() || c == '_')
                })
                || endpoint.matches('/').count() > 1 =>
            {
                Err(PlayerError::InvalidCommand(
                    "data endpoint must be like \"browse\" or \"music/get_search_suggestions\"",
                ))
            }
            PlayerCommand::SetPlaybackRate { rate }
                if !(rate.is_finite() && (0.25..=3.0).contains(rate)) =>
            {
                Err(PlayerError::InvalidCommand(
                    "playback rate must be within 0.25..=3",
                ))
            }
            PlayerCommand::Endpoint { endpoint, .. }
                if endpoint.is_empty() || endpoint.len() > 8 =>
            {
                Err(PlayerError::InvalidCommand(
                    "endpoint must be a single InnerTube endpoint object",
                ))
            }
            PlayerCommand::Navigate { path }
                if !path.starts_with('/')
                    || path.starts_with("//")
                    || path.chars().any(char::is_whitespace) =>
            {
                Err(PlayerError::InvalidCommand(
                    "navigate path must be an absolute same-origin path",
                ))
            }
            _ => Ok(()),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PlayerError {
    #[error("player window is not available")]
    NoPlayerWindow,
    #[error("invalid command: {0}")]
    InvalidCommand(&'static str),
    #[error("not allowed from window \"{0}\"")]
    WrongWindow(String),
    #[error("event payload too large")]
    PayloadTooLarge,
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl Serialize for PlayerError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub fn create_player_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let url = WebviewUrl::External(PLAYER_URL.parse().expect("static URL is valid"));
    // Dev aid: start with the player window visible to see what the page is showing.
    let visible = cfg!(debug_assertions) && std::env::var_os("MELODESK_DEV_SHOW_PLAYER").is_some();
    let window = WebviewWindowBuilder::new(app, PLAYER_LABEL, url)
        .title("Player")
        .inner_size(1100.0, 760.0)
        .min_inner_size(640.0, 480.0)
        .visible(visible)
        .user_agent(USER_AGENT)
        .initialization_script(BRIDGE_SCRIPT)
        .build()?;

    // Closing the player window would stop playback; hide it instead. Quitting the app
    // still closes everything.
    let handle = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = handle.hide();
        }
    });
    Ok(())
}

/// UI → player. Evaluates a single, serialised, serde-validated command in the player webview.
#[tauri::command]
pub fn player_command<R: Runtime>(
    app: AppHandle<R>,
    command: PlayerCommand,
) -> Result<(), PlayerError> {
    command.validate()?;
    let player = app
        .get_webview_window(PLAYER_LABEL)
        .ok_or(PlayerError::NoPlayerWindow)?;
    // serde_json output is a JS-safe literal; `dispatch` is frozen on a non-configurable global.
    let json = serde_json::to_string(&command)?;
    player.eval(format!(
        "window.__melodesk__ && window.__melodesk__.dispatch({json});"
    ))?;
    Ok(())
}

/// Show or hide the player window (used for sign-in and for anything we don't re-implement yet).
#[tauri::command]
pub fn player_set_visible<R: Runtime>(app: AppHandle<R>, visible: bool) -> Result<(), PlayerError> {
    let player = app
        .get_webview_window(PLAYER_LABEL)
        .ok_or(PlayerError::NoPlayerWindow)?;
    if visible {
        player.show()?;
        player.set_focus()?;
    } else {
        player.hide()?;
    }
    Ok(())
}

/// Player → UI. The only command the music.youtube.com webview can reach. The payload is
/// untrusted: it is bounded in size, never inspected here, and schema-validated in the UI.
#[tauri::command]
pub fn bridge_emit<R: Runtime>(
    window: Window<R>,
    event: serde_json::Value,
) -> Result<(), PlayerError> {
    if window.label() != PLAYER_LABEL {
        return Err(PlayerError::WrongWindow(window.label().to_string()));
    }
    let bytes = serde_json::to_vec(&event)?;
    if bytes.len() > MAX_EVENT_BYTES {
        return Err(PlayerError::PayloadTooLarge);
    }
    #[cfg(debug_assertions)]
    dev::observe(&event, &bytes);
    window
        .app_handle()
        .emit_to(MAIN_LABEL, BRIDGE_EVENT_CHANNEL, event)?;
    Ok(())
}

/// Debug-build aids: mirror bridge log/health/capability events to stderr, and when
/// `MELODESK_FIXTURE_DIR` is set, save raw data responses there so they can be turned into
/// adapter test fixtures (strip account data before committing one).
#[cfg(debug_assertions)]
mod dev {
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    pub fn observe(event: &serde_json::Value, bytes: &[u8]) {
        let kind = event.get("type").and_then(|t| t.as_str()).unwrap_or("?");
        match kind {
            "log" | "health" | "ready" | "navigation" | "track" | "flags" => {
                eprintln!("[bridge] {event}")
            }
            "queue" => {
                let q = event.get("queue");
                let n = q
                    .and_then(|q| q.get("items"))
                    .and_then(|i| i.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);
                eprintln!(
                    "[bridge] queue items={n} index={} shuffle={} repeat={} autoplay={} title={}",
                    q.and_then(|q| q.get("index")).cloned().unwrap_or_default(),
                    q.and_then(|q| q.get("shuffle"))
                        .cloned()
                        .unwrap_or_default(),
                    q.and_then(|q| q.get("repeat")).cloned().unwrap_or_default(),
                    q.and_then(|q| q.get("autoplay"))
                        .cloned()
                        .unwrap_or_default(),
                    q.and_then(|q| q.get("title")).cloned().unwrap_or_default(),
                );
            }
            "capabilities" => {
                eprintln!(
                    "[bridge] capabilities found={}",
                    event.get("found").cloned().unwrap_or_default()
                );
                if let Some(notes) = event.get("notes").and_then(|n| n.as_array()) {
                    for note in notes {
                        eprintln!("[bridge]   {}", note.as_str().unwrap_or(""));
                    }
                }
            }
            "dataResponse" => {
                let id = event
                    .get("requestId")
                    .and_then(|v| v.as_str())
                    .unwrap_or("?");
                let ok = event.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
                eprintln!("[bridge] dataResponse {id} ok={ok} bytes={}", bytes.len());
                if let Ok(dir) = std::env::var("MELODESK_FIXTURE_DIR") {
                    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
                    let path = std::path::Path::new(&dir).join(format!("{n:03}-{id}.json"));
                    if let Err(e) = std::fs::write(&path, bytes) {
                        eprintln!("[bridge] fixture write failed: {e}");
                    }
                }
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserialises_tagged_commands() {
        let cmd: PlayerCommand = serde_json::from_str(r#"{"type":"seek","seconds":12.5}"#).unwrap();
        assert!(matches!(cmd, PlayerCommand::Seek { seconds } if seconds == 12.5));
        let cmd: PlayerCommand = serde_json::from_str(r#"{"type":"requestState"}"#).unwrap();
        assert!(matches!(cmd, PlayerCommand::RequestState));
    }

    #[test]
    fn rejects_unknown_commands_and_drops_unknown_fields() {
        assert!(serde_json::from_str::<PlayerCommand>(r#"{"type":"eval","code":"1"}"#).is_err());
        // serde ignores extra fields on unit variants of internally tagged enums; what matters is
        // that nothing unknown survives into the JSON we eval in the player webview.
        let cmd: PlayerCommand = serde_json::from_str(r#"{"type":"play","extra":1}"#).unwrap();
        assert_eq!(serde_json::to_string(&cmd).unwrap(), r#"{"type":"play"}"#);
    }

    #[test]
    fn validates_ranges_and_paths() {
        assert!(PlayerCommand::SetVolume { volume: 1.5 }.validate().is_err());
        assert!(PlayerCommand::SetVolume { volume: 0.5 }.validate().is_ok());
        assert!(PlayerCommand::Seek { seconds: -1.0 }.validate().is_err());
        assert!(PlayerCommand::Seek { seconds: f64::NAN }
            .validate()
            .is_err());
        assert!(PlayerCommand::Navigate {
            path: "/explore".into()
        }
        .validate()
        .is_ok());
        assert!(PlayerCommand::Navigate {
            path: "//evil.example".into()
        }
        .validate()
        .is_err());
        assert!(PlayerCommand::Navigate {
            path: "https://evil.example".into()
        }
        .validate()
        .is_err());
    }

    #[test]
    fn validates_data_endpoints() {
        let ok = PlayerCommand::Data {
            request_id: "r1".into(),
            endpoint: "music/get_search_suggestions".into(),
            body: Default::default(),
        };
        assert!(ok.validate().is_ok());
        let bad = PlayerCommand::Data {
            request_id: "r1".into(),
            endpoint: "../evil".into(),
            body: Default::default(),
        };
        assert!(bad.validate().is_err());
        let json: PlayerCommand =
            serde_json::from_str(r#"{"type":"data","requestId":"x","endpoint":"browse","body":{"browseId":"FEmusic_home"}}"#).unwrap();
        assert!(matches!(json, PlayerCommand::Data { .. }));
    }

    #[test]
    fn command_json_is_a_safe_js_literal() {
        let json = serde_json::to_string(&PlayerCommand::Navigate {
            path: "/a</script>".into(),
        })
        .unwrap();
        // serde_json escapes nothing HTML-specific, but the string lands inside a JS string
        // literal in a function argument, not in markup, so '<' is harmless; quotes must be escaped.
        assert!(!json.contains("\"\""));
        assert!(json.starts_with('{') && json.ends_with('}'));
    }
}
