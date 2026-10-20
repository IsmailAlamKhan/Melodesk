//! Discord Rich Presence, used by the opt-in first-party plugin. The UI decides what to show;
//! this module only owns the IPC socket. Nothing is sent unless the plugin is enabled.

use std::sync::Mutex;

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use serde::Deserialize;
use tauri::State;

#[derive(Default)]
/// The connected client and the application id it was created with.
pub struct DiscordState(pub Mutex<Option<(String, DiscordIpcClient)>>);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Activity {
    pub details: String,
    pub state: String,
    pub large_image: Option<String>,
    pub large_text: Option<String>,
    pub start_ms: Option<i64>,
    pub end_ms: Option<i64>,
    pub button_label: Option<String>,
    pub button_url: Option<String>,
}

/// Discord application ids are numeric snowflakes (17 to 20 digits).
fn valid_client_id(id: &str) -> bool {
    (17..=20).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_digit())
}

fn connect(slot: &mut Option<(String, DiscordIpcClient)>, client_id: &str) -> Result<(), String> {
    if !valid_client_id(client_id) {
        return Err("Enter your Discord application ID in the plugin settings".into());
    }
    if let Some((current, _)) = slot.as_ref() {
        if current == client_id {
            return Ok(());
        }
    }
    // A different id (or none yet): drop any old connection and open a new one.
    if let Some((_, mut old)) = slot.take() {
        let _ = old.close();
    }
    let mut client = DiscordIpcClient::new(client_id);
    client
        .connect()
        .map_err(|e| format!("Discord is not running: {e}"))?;
    *slot = Some((client_id.to_string(), client));
    Ok(())
}

#[tauri::command]
pub fn discord_set_activity(
    state: State<'_, DiscordState>,
    client_id: String,
    activity: Activity,
) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|_| "discord state poisoned")?;
    connect(&mut slot, &client_id)?;
    let Some((_, client)) = slot.as_mut() else {
        return Ok(());
    };
    let details = truncate(&activity.details, 128);
    let st = truncate(&activity.state, 128);
    let mut act = activity::Activity::new()
        .details(&details)
        .state(&st)
        .activity_type(activity::ActivityType::Listening);
    let large_image = activity
        .large_image
        .as_deref()
        .filter(|u| u.starts_with("https://"))
        .map(|u| truncate(u, 256));
    let large_text = activity.large_text.as_deref().map(|t| truncate(t, 128));
    if large_image.is_some() || large_text.is_some() {
        let mut assets = activity::Assets::new();
        if let Some(img) = large_image.as_deref() {
            assets = assets.large_image(img);
        }
        if let Some(text) = large_text.as_deref() {
            assets = assets.large_text(text);
        }
        act = act.assets(assets);
    }
    if activity.start_ms.is_some() || activity.end_ms.is_some() {
        let mut ts = activity::Timestamps::new();
        if let Some(s) = activity.start_ms {
            ts = ts.start(s);
        }
        if let Some(e) = activity.end_ms {
            ts = ts.end(e);
        }
        act = act.timestamps(ts);
    }
    let label = activity.button_label.as_deref().map(|l| truncate(l, 32));
    let url = activity
        .button_url
        .as_deref()
        .filter(|u| u.starts_with("https://music.youtube.com/"));
    if let (Some(label), Some(url)) = (label.as_deref(), url) {
        act = act.buttons(vec![activity::Button::new(label, url)]);
    }
    if let Err(e) = client.set_activity(act) {
        // Discord went away; drop the client so the next call reconnects.
        *slot = None;
        return Err(e.to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn discord_clear(state: State<'_, DiscordState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|_| "discord state poisoned")?;
    if let Some((_, client)) = slot.as_mut() {
        let _ = client.clear_activity();
        let _ = client.close();
    }
    *slot = None;
    Ok(())
}

fn truncate(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

#[cfg(test)]
mod tests {
    use super::valid_client_id;

    #[test]
    fn accepts_only_numeric_snowflakes() {
        assert!(valid_client_id("1430000000000000000"));
        assert!(valid_client_id("12345678901234567"));
        assert!(!valid_client_id("1234"));
        assert!(!valid_client_id("abc00000000000000000"));
        assert!(!valid_client_id(""));
    }
}
