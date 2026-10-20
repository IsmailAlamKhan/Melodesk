//! OS integration that lives outside the webviews: tray with playback controls (the macOS
//! "menu bar mini player"), the macOS app menu, window vibrancy, close-to-tray, launch at
//! login, and track-change notifications. All of it reads player state that the bridge
//! reports; it never touches playback itself except by sending the same typed commands the
//! UI sends.

use std::sync::Mutex;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    AppHandle, Manager, Runtime, WindowEvent,
};

use crate::player::{self, PlayerCommand, MAIN_LABEL};
use crate::settings;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
    pub playing: bool,
    pub artwork_url: Option<String>,
    pub video_id: Option<String>,
}

/// Menu items whose text follows playback, kept so they can be updated in place.
pub struct NativeState<R: Runtime> {
    pub now_playing: Mutex<NowPlaying>,
    tray_title: MenuItem<R>,
    tray_play_pause: MenuItem<R>,
    app_play_pause: Option<MenuItem<R>>,
}

const ID_TITLE: &str = "np.title";
const ID_PLAY_PAUSE: &str = "np.playpause";
const ID_NEXT: &str = "np.next";
const ID_PREVIOUS: &str = "np.previous";
const ID_SHOW: &str = "app.show";
const ID_QUIT: &str = "app.quit";
const ID_ABOUT: &str = "app.about";

const TRAY_ICON: &[u8] = include_bytes!("../icons/tray.png");

pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    // --- tray ---------------------------------------------------------------
    let tray_title = MenuItem::with_id(app, ID_TITLE, "Nothing playing", false, None::<&str>)?;
    let tray_play_pause = MenuItem::with_id(app, ID_PLAY_PAUSE, "Play", true, None::<&str>)?;
    let next = MenuItem::with_id(app, ID_NEXT, "Next", true, None::<&str>)?;
    let previous = MenuItem::with_id(app, ID_PREVIOUS, "Previous", true, None::<&str>)?;
    let show = MenuItem::with_id(app, ID_SHOW, "Show Melodesk", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, ID_QUIT, "Quit Melodesk", true, None::<&str>)?;
    let tray_menu = Menu::with_items(
        app,
        &[
            &tray_title,
            &PredefinedMenuItem::separator(app)?,
            &tray_play_pause,
            &next,
            &previous,
            &PredefinedMenuItem::separator(app)?,
            &show,
            &quit,
        ],
    )?;
    let icon = Image::from_bytes(TRAY_ICON)?;
    TrayIconBuilder::with_id("main")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Melodesk")
        .menu(&tray_menu)
        .show_menu_on_left_click(true)
        .build(app)?;

    // --- macOS app menu with a Playback submenu -----------------------------
    #[cfg(not(target_os = "macos"))]
    let app_play_pause: Option<MenuItem<R>> = None;
    #[cfg(target_os = "macos")]
    let app_play_pause = {
        let menu = Menu::default(app)?;
        let pp = MenuItem::with_id(app, ID_PLAY_PAUSE, "Play", true, Some("Space"))?;
        let playback = Submenu::with_items(
            app,
            "Playback",
            true,
            &[
                &pp,
                &MenuItem::with_id(app, ID_NEXT, "Next", true, Some("Cmd+Right"))?,
                &MenuItem::with_id(app, ID_PREVIOUS, "Previous", true, Some("Cmd+Left"))?,
                &PredefinedMenuItem::separator(app)?,
                &MenuItem::with_id(app, ID_ABOUT, "About Melodesk", true, None::<&str>)?,
            ],
        )?;
        menu.append(&playback)?;
        app.set_menu(menu)?;
        Some(pp)
    };
    #[cfg(not(target_os = "macos"))]
    {
        let _ = Submenu::<R>::with_items; // keep the import used on all platforms
    }

    app.manage(NativeState {
        now_playing: Mutex::new(NowPlaying::default()),
        tray_title,
        tray_play_pause,
        app_play_pause,
    });

    app.on_menu_event(|app, event| match event.id().as_ref() {
        ID_PLAY_PAUSE => player::dispatch(app, PlayerCommand::Toggle),
        ID_NEXT => player::dispatch(app, PlayerCommand::Next),
        ID_PREVIOUS => player::dispatch(app, PlayerCommand::Previous),
        ID_SHOW => show_main(app),
        ID_ABOUT => {
            show_main(app);
            let _ = tauri::Emitter::emit_to(app, MAIN_LABEL, "app:navigate", "/settings");
        }
        ID_QUIT => app.exit(0),
        _ => {}
    });

    // --- main window: vibrancy + close-to-tray ------------------------------
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        #[cfg(target_os = "macos")]
        {
            use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
            let _ = apply_vibrancy(&main, NSVisualEffectMaterial::Sidebar, None, Some(10.0));
        }
        #[cfg(target_os = "windows")]
        {
            use window_vibrancy::{apply_acrylic, apply_mica};
            if apply_mica(&main, None).is_err() {
                let _ = apply_acrylic(&main, Some((18, 18, 18, 125)));
            }
        }
        let handle = app.clone();
        main.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if settings::current(&handle).close_to_tray {
                    api.prevent_close();
                    if let Some(w) = handle.get_webview_window(MAIN_LABEL) {
                        let _ = w.hide();
                    }
                } else {
                    handle.exit(0);
                }
            }
        });
    }
    Ok(())
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(MAIN_LABEL) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

pub fn toggle_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window(MAIN_LABEL) {
        if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show_main(app);
        }
    }
}

/// Fold a bridge event into native state. The payload is untrusted: only a few string
/// fields are read, truncated, and used for display.
pub fn observe<R: Runtime>(app: &AppHandle<R>, event: &serde_json::Value) {
    let kind = event.get("type").and_then(|t| t.as_str()).unwrap_or("");
    let state = match app.try_state::<NativeState<R>>() {
        Some(s) => s,
        None => return,
    };
    let mut np = match state.now_playing.lock() {
        Ok(np) => np,
        Err(_) => return,
    };
    let before = np.clone();
    match kind {
        "track" => {
            let track = event.get("track");
            let s = |k: &str| {
                track
                    .and_then(|t| t.get(k))
                    .and_then(|v| v.as_str())
                    .map(|v| v.chars().take(200).collect::<String>())
            };
            np.title = s("title").unwrap_or_default();
            np.artist = s("artist").unwrap_or_default();
            np.video_id = s("videoId");
            np.artwork_url = s("artworkUrl").filter(|u| u.starts_with("https://"));
        }
        "state" => {
            np.playing = event
                .get("state")
                .and_then(|s| s.get("playing"))
                .and_then(|p| p.as_bool())
                .unwrap_or(false);
        }
        _ => return,
    }
    if *np == before {
        return;
    }
    let snapshot = np.clone();
    drop(np);

    let title = if snapshot.title.is_empty() {
        "Nothing playing".to_string()
    } else if snapshot.artist.is_empty() {
        snapshot.title.clone()
    } else {
        format!("{} — {}", snapshot.title, snapshot.artist)
    };
    let _ = state.tray_title.set_text(&title);
    let pp = if snapshot.playing { "Pause" } else { "Play" };
    let _ = state.tray_play_pause.set_text(pp);
    if let Some(item) = &state.app_play_pause {
        let _ = item.set_text(pp);
    }
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(if snapshot.title.is_empty() {
            "Melodesk".to_string()
        } else {
            title.clone()
        }));
    }

    #[cfg(target_os = "linux")]
    crate::media::update(app, &snapshot);

    let track_changed =
        kind == "track" && !snapshot.title.is_empty() && snapshot.video_id != before.video_id;
    if track_changed && settings::current(app).notify_on_track_change {
        let focused = app
            .get_webview_window(MAIN_LABEL)
            .and_then(|w| w.is_focused().ok())
            .unwrap_or(false);
        if !focused {
            use tauri_plugin_notification::NotificationExt;
            let _ = app
                .notification()
                .builder()
                .title(&snapshot.title)
                .body(&snapshot.artist)
                .show();
        }
    }
}

pub fn apply_autostart<R: Runtime>(app: &AppHandle<R>, enabled: bool) -> tauri::Result<()> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    result.map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!(e.to_string())))
}
