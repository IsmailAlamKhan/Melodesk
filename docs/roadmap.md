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
- **Karaoke mode** is done (sing-along lyrics only; no vocal removal, see architecture notes).
- Done since: offline cover art, Playwright end-to-end tests, README screenshots, a feature system
  (`docs/extending.md`), responsive layouts, more lyrics sources with smart matching for covers,
  music visuals, continue listening, listening recaps, an accessibility audit (axe) in the tests, a
  privacy page, and recovery from a stuck player or a crashing page.
- Still open: native account switching, checking the mini player and the opt-in plugins on real
  accounts, and verifying Windows and Linux. See [good-first-issues.md](good-first-issues.md).

## Ideas, roughly in order

- **Real audio levels.** The music visuals follow the rhythm of playback on macOS and Linux because the
  page's audio cannot be measured there. A native audio tap (Core Audio process tap on macOS 14.2+,
  PipeWire or PulseAudio monitor on Linux) would make them real, behind a permission prompt; on Windows
  an `AnalyserNode` on the player's element should work and needs a tester.
- **Signed installers** for every platform (the release workflow is ready; it needs certificates).
- **Third-party plugins.** The permission model is built for it; loading outside code needs a sandbox
  (an isolated worker with a message bridge) that is not written yet.
- **A plugin gallery** page, once there is more than the first-party set.
- **Windows and Linux** passes by someone who runs them: media keys, tray, global shortcuts, the player
  window and video.
