//! User-configurable global shortcuts. Media keys themselves are handled by the OS through the
//! webview's Media Session integration; these are the extra, app-level combos.

use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::player::{self, PlayerCommand};
use crate::settings::Shortcuts;

#[derive(Clone, Copy)]
enum Action {
    PlayPause,
    Next,
    Previous,
    VolumeUp,
    VolumeDown,
    Mute,
    ShowHide,
}

pub fn apply<R: Runtime>(app: &AppHandle<R>, shortcuts: &Shortcuts) -> tauri::Result<()> {
    let gs = app.global_shortcut();
    gs.unregister_all()
        .map_err(|e| tauri::Error::Anyhow(anyhow::anyhow!(e.to_string())))?;
    let bindings: [(&Option<String>, Action); 7] = [
        (&shortcuts.play_pause, Action::PlayPause),
        (&shortcuts.next, Action::Next),
        (&shortcuts.previous, Action::Previous),
        (&shortcuts.volume_up, Action::VolumeUp),
        (&shortcuts.volume_down, Action::VolumeDown),
        (&shortcuts.mute, Action::Mute),
        (&shortcuts.show_hide, Action::ShowHide),
    ];
    for (combo, action) in bindings {
        let Some(combo) = combo.as_deref().filter(|c| !c.trim().is_empty()) else {
            continue;
        };
        let result = gs.on_shortcut(combo, move |app, _shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            match action {
                Action::PlayPause => player::dispatch(app, PlayerCommand::Toggle),
                Action::Next => player::dispatch(app, PlayerCommand::Next),
                Action::Previous => player::dispatch(app, PlayerCommand::Previous),
                Action::VolumeUp => {
                    player::dispatch(app, PlayerCommand::VolumeStep { delta: 0.05 })
                }
                Action::VolumeDown => {
                    player::dispatch(app, PlayerCommand::VolumeStep { delta: -0.05 })
                }
                Action::Mute => player::dispatch(app, PlayerCommand::ToggleMute),
                Action::ShowHide => crate::native::toggle_main(app),
            }
        });
        if let Err(e) = result {
            // A combo the OS refuses (taken by another app, or malformed) must not break the rest.
            eprintln!("[shortcuts] could not register {combo}: {e}");
        }
    }
    Ok(())
}
