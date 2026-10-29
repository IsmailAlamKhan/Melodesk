# 00 — Charter

## Goal

Melodesk is an open-source (MIT) desktop client for YouTube Music, built with Tauri 2 (Rust shell) and a
React + TypeScript UI, that also plays the user's own music, music servers, podcasts and radio. It is
**not affiliated with Google or YouTube** and never presents YouTube branding as its own identity.
Repository: `github.com/IsmailAlamKhan/Melodesk` (public). Bundle identifier `app.melodesk.desktop`.

## Hard rules (apply to every prompt)

1. **Playback, sign-in and ads go only through the official music.youtube.com web player**, running in a
   hidden webview window. No stream extraction, no downloading YouTube audio, no ad blocking or hiding,
   no reading cookies or tokens, no handling Google credentials.
2. **No telemetry.** Nothing is sent anywhere by default. Every outbound request is either to
   music.youtube.com (the player), a host the user explicitly added or switched on, or a plugin host the
   user switched on. Optional things (plugins, sync, song info, the AI helper) are **off until the user
   turns them on**, and say what they send.
3. **Strict CSP and capabilities.** The main window has `default-src 'self'`. Tauri commands are
   deny-by-default and listed explicitly in `build.rs` and `capabilities/main.json`. The player window
   may call `bridge_emit` only.
4. **Exact-pinned dependencies** (no `^`/`~`), and nothing published less than about a week before it is
   adopted. Rust toolchain pinned in `rust-toolchain.toml` (1.99.1, with clippy and rustfmt).
5. **Secrets never go in the repo, logs or files shared between computers.** Secrets live in the system
   keychain (Linux: a user-only file). The sync file formats exclude them unless end-to-end encrypted.
6. **Honesty.** State what was tested and what was not. Nothing here could be run against a real audio
   device, a real Subsonic/Navidrome server, real feeds, a real ad, Windows or Linux beyond CI. Say so.
7. **Everything user-facing is translatable** (`apps/desktop/src/i18n/locales/en.json`, typed keys).

## Working style

- Commits are authored by the user only: **no `Co-Authored-By` trailer, no "Generated with" footer**.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`); `feat` bumps the minor,
  `fix` the patch (release-please).
- Keep CPU use low on the developer machine: run targeted tests locally, use CI as the authority for the
  full matrix. Never run `pnpm features:removable` while committing (it temporarily deletes folders).
- Never take full-screen screenshots; screenshot only the app or browser pane.
- Prefer showing results (screenshots of the app, real responses) over describing them.
- The user is often away: do the whole job, release it, and report honestly; ask only when blocked.

## Acceptance

- `pnpm check` passes (typecheck, lint, i18n, unit tests, features-removable, e2e, rustfmt, clippy, Rust tests).
- A new reader can find, for any behaviour, the prompt that specifies it.

## Known limits

- Third-party sandboxed plugin loading is not implemented: plugins are first-party modules behind a
  permission model.
