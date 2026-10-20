//! Melodesk desktop shell.
//!
//! The Rust side is deliberately thin: it owns windows, OS integration and a narrow IPC
//! surface. All playback happens inside the official music.youtube.com web player, which
//! runs in its own webview window (see [`player`]).

mod player;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:melodesk.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            player::player_command,
            player::player_set_visible,
            player::bridge_emit,
        ])
        .setup(|app| {
            player::create_player_window(app.handle())?;
            if let Some(main) = app.get_webview_window("main") {
                main.set_focus().ok();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn migrations() -> Vec<tauri_plugin_sql::Migration> {
    use tauri_plugin_sql::{Migration, MigrationKind};
    vec![Migration {
        version: 1,
        description: "create settings and history tables",
        sql: include_str!("../migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }]
}
