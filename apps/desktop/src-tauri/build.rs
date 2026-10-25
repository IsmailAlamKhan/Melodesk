fn main() {
    // Register our own commands with the permission system so capabilities can allow or
    // deny them per window. Without this, app commands would be callable from any webview
    // that has IPC access, including the remote music.youtube.com one.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "player_command",
            "player_set_visible",
            "player_reload",
            "bridge_emit",
            "get_settings",
            "set_settings",
            "discord_set_activity",
            "discord_clear",
            "open_mini_player",
            "set_native_labels",
            "local_scan",
            "local_read_file",
            "local_artwork",
            "local_lyrics_sidecar",
            "local_set_active",
            "local_report",
            "local_write_tags",
            "control_start",
            "control_stop",
            "net_allow",
            "net_text",
            "net_bytes",
            "radio_open",
            "native_modules",
        ]),
    ))
    .expect("failed to run tauri-build");
}
