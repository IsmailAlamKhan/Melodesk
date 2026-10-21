# Roadmap

## Milestone 0 — architecture proof (done)

A window that loads the player bridge and plays a song, with our own play/pause button
controlling it.

## Phase 1 — core parity

Sign-in and account switching; Home, Explore, Charts, Moods & Genres; search with suggestions
and filters; artist/album/playlist pages; library; full playback controls; queue; like/dislike,
playlists, share; synced lyrics.

## Phase 2 — native desktop integration

Now Playing / SMTC / MPRIS, media keys, tray, global shortcuts, deep links, auto-updates.

## Phase 3 — beyond YouTube Music

Mini player, full-screen Now Playing, lyrics fallback, scrobbling, Discord RPC, stats,
command palette, smart queue tools, playlist power tools, themes, plugin system, i18n.

### Phase 3 — open items

- **Equalizer and volume leveling.** Not possible on macOS or Linux (WebKit silences Web Audio
  on MSE media elements; see `docs/architecture.md`). The engine and protocol exist and are
  untested on Windows; a Settings UI is worth building once someone confirms it works there
  with `VITE_AUDIO_SELFTEST=1`.
- **Crossfade.** Not feasible through the single page-owned player.
- Offline artwork caching, Playwright end-to-end tests, README screenshots.
