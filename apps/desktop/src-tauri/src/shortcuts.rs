//! User-configurable global shortcuts. Media keys themselves are handled by the OS through the
//! webview's Media Session integration; these are the extra, app-level combos.

use tauri::{AppHandle, Runtime};
#[cfg(feature = "shortcuts")]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[cfg(feature = "shortcuts")]
use crate::player::{self, PlayerCommand};
use crate::settings::Shortcuts;

#[cfg(feature = "shortcuts")]
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

/// Why a global shortcut would get in the way of typing, or `None` if it is safe to register.
///
/// A global shortcut is taken from *every* app, so a combination that edits or selects text there
/// (Cmd+Shift+Right selects to the end of the line, Cmd+C copies…) would break writing everywhere.
pub fn conflict(combo: &str) -> Option<&'static str> {
    let mut cmd = false;
    let mut ctrl = false;
    let mut shift = false;
    let mut alt = false;
    let mut key = "";
    for part in combo.split('+').map(str::trim).filter(|p| !p.is_empty()) {
        match part.to_ascii_lowercase().as_str() {
            "commandorcontrol" | "cmdorcontrol" | "cmdorctrl" | "commandorctrl" | "cmd"
            | "command" | "super" | "meta" => cmd = true,
            "control" | "ctrl" => ctrl = true,
            "shift" => shift = true,
            "alt" | "option" => alt = true,
            _ => key = part,
        }
    }
    let _ = shift;
    if key.is_empty() {
        return Some("it has no key");
    }
    let lower = key.to_ascii_lowercase();
    let function_or_media =
        (lower.starts_with('f') && lower[1..].parse::<u8>().is_ok()) || lower.starts_with("media");
    let heavy = u8::from(cmd) + u8::from(ctrl) + u8::from(alt);
    if heavy == 0 && !function_or_media {
        return Some("it needs Cmd/Ctrl or Alt, or it would capture ordinary typing");
    }
    let editing = matches!(
        lower.as_str(),
        "left"
            | "right"
            | "up"
            | "down"
            | "home"
            | "end"
            | "pageup"
            | "pagedown"
            | "backspace"
            | "delete"
            | "enter"
            | "return"
            | "tab"
            | "escape"
    );
    // With all three of Cmd, Ctrl and Alt held it is not something anyone types by accident.
    if editing && heavy < 3 && !function_or_media {
        return Some("arrow, Home/End and delete keys with these modifiers move or select text");
    }
    if (cmd || ctrl) && !alt && matches!(lower.as_str(), "a" | "c" | "v" | "x" | "z" | "y") {
        return Some("it is the select-all, copy, paste, cut or undo shortcut");
    }
    None
}

/// Refuse settings that contain a shortcut `conflict` rejects, with a message the UI can show.
pub fn validate(shortcuts: &Shortcuts) -> Result<(), String> {
    let all = [
        &shortcuts.play_pause,
        &shortcuts.next,
        &shortcuts.previous,
        &shortcuts.volume_up,
        &shortcuts.volume_down,
        &shortcuts.mute,
        &shortcuts.show_hide,
    ];
    for combo in all.into_iter().flatten().filter(|c| !c.trim().is_empty()) {
        if let Some(why) = conflict(combo) {
            return Err(format!("{combo} can't be a global shortcut: {why}."));
        }
    }
    Ok(())
}

/// Without the `shortcuts` module there is nothing to register; the UI hides the settings.
#[cfg(not(feature = "shortcuts"))]
pub fn apply<R: Runtime>(_app: &AppHandle<R>, _shortcuts: &Shortcuts) -> tauri::Result<()> {
    Ok(())
}

#[cfg(feature = "shortcuts")]
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
        if let Some(why) = conflict(combo) {
            // Hand-edited settings can still contain one; never register it.
            eprintln!("[shortcuts] ignoring {combo}: {why}");
            continue;
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_selection_and_editing_combos_are_refused() {
        for combo in [
            "CommandOrControl+Shift+Right",
            "CommandOrControl+Shift+Left",
            "CommandOrControl+Right",
            "Alt+Left",
            "Alt+Shift+Right",
            "Control+Up",
            "CommandOrControl+Backspace",
            "CommandOrControl+C",
            "CommandOrControl+Shift+Z",
            "CommandOrControl+Alt+Up",
            "CommandOrControl+A",
            "Shift+Space",
            "M",
            "",
        ] {
            assert!(conflict(combo).is_some(), "{combo} should be refused");
        }
    }

    #[test]
    fn ordinary_global_shortcuts_are_allowed() {
        for combo in [
            "CommandOrControl+Alt+M",
            "CommandOrControl+Shift+Space",
            "Control+Alt+P",
            "Control+Alt+Command+Right",
            "F8",
            "MediaPlayPause",
        ] {
            assert!(conflict(combo).is_none(), "{combo} should be allowed");
        }
    }

    #[test]
    fn validate_reports_the_first_bad_shortcut() {
        let ok = Shortcuts::default();
        assert!(validate(&ok).is_ok());
        let bad = Shortcuts {
            next: Some("CommandOrControl+Shift+Right".into()),
            ..Shortcuts::default()
        };
        let err = validate(&bad).unwrap_err();
        assert!(err.contains("CommandOrControl+Shift+Right"));
    }
}
