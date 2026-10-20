//! Melodesk desktop shell.
//!
//! The Rust side is deliberately thin: it owns windows, OS integration and a narrow IPC
//! surface. All playback happens inside the official music.youtube.com web player, which
//! runs in its own webview window (see [`player`]).

mod deeplink;
mod discord;
#[cfg(target_os = "linux")]
mod media;
mod native;
mod player;
mod settings;
mod shortcuts;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            deeplink::handle_argv(app, &argv);
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:melodesk.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            player::player_command,
            player::player_set_visible,
            player::bridge_emit,
            settings::get_settings,
            settings::set_settings,
            discord::discord_set_activity,
            discord::discord_clear,
            native::open_mini_player,
            native::set_native_labels,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let settings = settings::load(&handle);
            app.manage(settings::SettingsState(std::sync::Mutex::new(
                settings.clone(),
            )));
            app.manage(discord::DiscordState::default());
            player::create_player_window(&handle)?;
            native::setup(&handle)?;
            #[cfg(target_os = "linux")]
            media::setup(&handle);
            deeplink::setup(&handle)?;
            if let Err(e) = shortcuts::apply(&handle, &settings.shortcuts) {
                eprintln!("[shortcuts] {e}");
            }
            if let Some(main) = app.get_webview_window(player::MAIN_LABEL) {
                main.set_focus().ok();
            }
            let show_handle = handle.clone();
            tauri::Listener::listen_any(&handle, "app:show-main", move |_| {
                native::show_main(&show_handle);
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS: clicking the Dock icon with no visible window brings the app back.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                native::show_main(app);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
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
