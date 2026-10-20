fn main() {
    // Register our own commands with the permission system so capabilities can allow or
    // deny them per window. Without this, app commands would be callable from any webview
    // that has IPC access, including the remote music.youtube.com one.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "player_command",
            "player_set_visible",
            "bridge_emit",
            "get_settings",
            "set_settings",
            "discord_set_activity",
            "discord_clear",
            "open_mini_player",
        ]),
    ))
    .expect("failed to run tauri-build");
}
