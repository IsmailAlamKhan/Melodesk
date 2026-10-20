# Melodesk

**An open-source, native desktop client for YouTube Music on macOS and Windows (Linux as a bonus).**

> Melodesk is an independent open-source project. It is **not affiliated with, endorsed by, or
> sponsored by Google LLC or YouTube.** YouTube and YouTube Music are trademarks of Google LLC.
> Melodesk does not download media, block ads, or bypass any YouTube protections.

> Status: pre-alpha. The architecture is proven (our own UI drives the official web player);
> feature parity is in progress. See [docs/roadmap.md](docs/roadmap.md).

## Why

YouTube Music has no official desktop app. The usual options are a browser tab or a heavy
Electron wrapper. Melodesk is a small Tauri app that uses the OS's own webview, feels native
on each platform, and adds the power-user features a web player can't: a mini player,
global shortcuts, scrobbling, listening stats, a command palette, themes, and plugins.

## How it works (and why that is legal-safe)

All playback, sign-in, and ads happen inside the **official music.youtube.com web player**,
running in a webview window. Melodesk injects a small, audited bridge script into that page
that exposes a typed play/pause/seek/queue API to our own UI over Tauri IPC. Nothing about
your Google account passes through Melodesk's code: cookies live in the webview's own
encrypted storage, and sign-in is Google's own page.

See [docs/architecture.md](docs/architecture.md) for the full picture and the trust model.

## Features

Planned and in progress; ticked items work today.

- [x] Google sign-in through Google's own page (never through our code)
- [x] Play / pause / next / previous / seek / volume / shuffle / repeat from our own UI
- [x] Health check that shows "an update is needed" when YouTube changes something
- [x] Your own Home feed (same shelves, same order, infinite scroll), Explore, Charts, Moods & Genres, New releases
- [x] Search with live suggestions and YouTube's filter chips
- [x] Artist, album and playlist pages; context menus with YouTube's own actions
- [x] Library (playlists, songs, albums, artists, subscriptions, podcasts, uploads, history)
- [x] Live queue panel with drag-and-drop reorder, play next, add to queue
- [ ] Create / rename / delete playlists, add-to-playlist dialog, lyrics panel (parsers done, UI pending)
- [x] Now Playing / media keys (macOS, Windows via the webview), MPRIS (Linux), tray with controls
- [x] Close to tray, launch at login, configurable global shortcuts, track-change notifications
- [x] `melodesk://` deep links and music.youtube.com link handling, signed auto-updates
- [ ] Mini player, full-screen Now Playing with synced lyrics
- [ ] Last.fm / ListenBrainz scrobbling, Discord Rich Presence (opt-in)
- [x] Light / dark / AMOLED themes, accent colors (including from album art), density, right-to-left layout
- [x] Translation framework with English strings; see [docs/translating.md](docs/translating.md)
- [x] Listening stats, command palette, plugins, lyrics romanization and translation

## Install

Pre-built installers will be published on the Releases page once Phase 1 is complete.

## Build from source

Requirements: Node 22+, pnpm 10, Rust 1.85+ (a `rust-toolchain.toml` pins the exact version),
and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
pnpm install
pnpm dev
```

```bash
pnpm build
```

Useful scripts: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm clippy`.

## Privacy

No telemetry. Nothing leaves your machine except the traffic the YouTube Music web app itself
generates. Optional integrations (scrobbling, Discord) are off by default and documented.

## FAQ

**Is this against YouTube's terms?** Melodesk is a browser-like shell around the official web
player with a UI on top. It does not extract streams, download media, or block ads. We think
that is the right side of the line, but we are not lawyers and this is not legal advice.

**Does it need YouTube Music Premium?** No more than the website does. Ads play if you don't
have Premium; background playback works because the player runs in an app window.

**Why Tauri and not Electron?** Smaller installer, less memory, and native webviews.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues are labelled on the issue tracker.

## License

[MIT](LICENSE)
