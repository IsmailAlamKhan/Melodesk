//! Linux: MPRIS via souvlaki (WebKitGTK does not expose Media Session to the desktop the way
//! WKWebView and WebView2 do). On macOS and Windows the webview's own Media Session already
//! provides Now Playing / SMTC and media keys, so this module is Linux-only.

use std::sync::Mutex;

use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, PlatformConfig};
use tauri::{AppHandle, Manager, Runtime};

use crate::native::NowPlaying;
use crate::player::{self, PlayerCommand};

pub struct MediaState(pub Mutex<Option<MediaControls>>);

pub fn setup<R: Runtime>(app: &AppHandle<R>) {
    let config = PlatformConfig {
        dbus_name: "melodesk",
        display_name: "Melodesk",
        hwnd: None,
    };
    let mut controls = match MediaControls::new(config) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[mpris] unavailable: {e:?}");
            app.manage(MediaState(Mutex::new(None)));
            return;
        }
    };
    let handle = app.clone();
    let attached = controls.attach(move |event: MediaControlEvent| {
        let cmd = match event {
            MediaControlEvent::Play => Some(PlayerCommand::Play),
            MediaControlEvent::Pause => Some(PlayerCommand::Pause),
            MediaControlEvent::Toggle => Some(PlayerCommand::Toggle),
            MediaControlEvent::Next => Some(PlayerCommand::Next),
            MediaControlEvent::Previous => Some(PlayerCommand::Previous),
            MediaControlEvent::Stop => Some(PlayerCommand::Pause),
            MediaControlEvent::Raise => {
                crate::native::show_main(&handle);
                None
            }
            MediaControlEvent::Quit => {
                handle.exit(0);
                None
            }
            _ => None,
        };
        if let Some(cmd) = cmd {
            player::dispatch(&handle, cmd);
        }
    });
    if let Err(e) = attached {
        eprintln!("[mpris] attach failed: {e:?}");
    }
    app.manage(MediaState(Mutex::new(Some(controls))));
}

pub fn update<R: Runtime>(app: &AppHandle<R>, np: &NowPlaying) {
    let Some(state) = app.try_state::<MediaState>() else {
        return;
    };
    let Ok(mut guard) = state.0.lock() else {
        return;
    };
    let Some(controls) = guard.as_mut() else {
        return;
    };
    let _ = controls.set_metadata(MediaMetadata {
        title: Some(&np.title),
        artist: Some(&np.artist),
        album: None,
        cover_url: np.artwork_url.as_deref(),
        duration: None,
    });
    let _ = controls.set_playback(if np.playing {
        MediaPlayback::Playing { progress: None }
    } else {
        MediaPlayback::Paused { progress: None }
    });
}
