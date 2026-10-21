//! Stand-in for `discord.rs` in builds without the `discord` feature: the commands exist (the UI
//! may still call them) and say the module is missing.

pub fn setup<R: tauri::Runtime>(_app: &tauri::AppHandle<R>) {}

const OFF: &str = "Discord presence is not built into this version";

#[tauri::command]
pub fn discord_set_activity() -> Result<(), String> {
    Err(OFF.into())
}

#[tauri::command]
pub fn discord_clear() -> Result<(), String> {
    Err(OFF.into())
}
