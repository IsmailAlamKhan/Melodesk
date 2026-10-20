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
/// Upper bound on a single bridge event payload; anything larger is dropped.
const MAX_EVENT_BYTES: usize = 64 * 1024;

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
    Seek { seconds: f64 },
    SetVolume { volume: f64 },
    SetMuted { muted: bool },
    Navigate { path: String },
    RequestState,
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
    let window = WebviewWindowBuilder::new(app, PLAYER_LABEL, url)
        .title("Player")
        .inner_size(1100.0, 760.0)
        .min_inner_size(640.0, 480.0)
        .visible(false)
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
    let size = serde_json::to_vec(&event)?.len();
    if size > MAX_EVENT_BYTES {
        return Err(PlayerError::PayloadTooLarge);
    }
    window
        .app_handle()
        .emit_to(MAIN_LABEL, BRIDGE_EVENT_CHANNEL, event)?;
    Ok(())
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
