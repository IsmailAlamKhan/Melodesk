# Architecture

## The one idea

Melodesk never touches audio, auth, or ads. The official YouTube Music web app runs in a
webview window exactly as it would in a browser. Our UI lives in a second window and talks
to the player through a small bridge. If you remember one diagram, remember this one:

```
┌─────────────────────────────┐        typed IPC        ┌──────────────────────────────┐
│  main window (our UI)       │ ──player_command──────▶ │  player window                │
│  React + Zustand            │                         │  https://music.youtube.com    │
│  validates every event      │ ◀──bridge_emit──────── │  + injected bridge script     │
│  with Zod                   │   (opaque JSON)         │  (reads player API, DOM,      │
└─────────────────────────────┘                         │   MediaSession; no cookies)   │
              ▲                                          └──────────────────────────────┘
              │ emit_to("main", "player:event")                         ▲
              │                                                         │ eval(dispatch(cmd))
        ┌─────┴─────────────────────────────────────────────────────────┴──────┐
        │  Rust (apps/desktop/src-tauri): windows, tray, media keys, IPC        │
        │  serde-validates commands; forwards events without inspecting them    │
        └───────────────────────────────────────────────────────────────────────┘
```

## Trust model

| Party                                    | Trusted? | May call                                           |
| ---------------------------------------- | -------- | -------------------------------------------------- |
| main window (our React app)              | yes      | `player_command`, `player_set_visible`, SQL plugin |
| player window (Google's JS + our bridge) | **no**   | `bridge_emit` only                                 |
| Rust shell                               | yes      | everything                                         |

- Capabilities (`apps/desktop/src-tauri/capabilities/*.json`) enforce the table above. App
  commands are registered with `tauri_build::AppManifest::commands` so they are deny-by-default.
- `bridge_emit` checks the calling window label, bounds the payload size, and forwards the
  JSON to the main window **without parsing it**. The UI validates with `BridgeEventSchema`
  (Zod, strict) and counts rejections; too many flips the health banner to "degraded".
- `player_command` is a serde `enum` with `deny_unknown_fields`, then range-checked, then
  serialised back to JSON before `eval`. The bridge's `dispatch` is a frozen, non-configurable
  global, so page scripts cannot replace it.
- The bridge script runs on every document in the player webview, including Google's sign-in
  pages. Its first line exits unless the host is exactly `music.youtube.com` and it is the top
  frame. It never reads forms, cookies, or storage.
- The main window has a strict CSP (`default-src 'self'`); only artwork hosts are allowed for
  images. The player window has whatever CSP YouTube sends.

## Packages

- **packages/bridge** – `protocol.ts` (Zod schemas + types, shared with the UI) and `inject/`
  (built to a single 5 kB IIFE embedded in the Rust binary via `include_str!`). Selectors are
  versioned (`selectors.v1.ts`).
- **packages/adapter** – parsers for YouTube's data (home, search, library …). Versioned,
  fixture-tested in CI. The only place that knows YouTube's response shapes.
- **packages/ui** – design tokens (`tokens.css`) and React components.
- **packages/plugins** – plugin SDK (manifest, permissions) and first-party plugins.
- **apps/desktop** – the Tauri shell and the React application that composes the above. Its UI is
  `src/core` (feature framework), `src/app` (shell) and `src/features/*` (everything else).

## The app is assembled from features

The React app is a thin shell (`src/app`: layout, sidebar, player bar) plus a framework (`src/core`)
plus **features** (`src/features/<id>/`). Each feature default-exports `defineFeature({...})` and
contributes to named extension points: routes, sidebar links, right-hand panels, overlays,
providers, slots, palette commands, right-click entries, settings sections and extra windows.
`import.meta.glob` finds the folders at build time, so adding a folder plugs a feature in and
deleting it removes it. Users can switch non-core features off in Settings → Features; the
registry recomputes what is active (dependencies, missing native modules), the UI follows, and
each feature's `start()` is cleaned up.

Features are trusted first-party code. The permission-gated plugin SDK (`packages/plugins`) is a
separate layer for anything that handles the user's data on the way to an outside service; the
Integrations feature hosts it. Rules that keep features independent (no imports between features
except through `dependsOn`, nothing outside reaching in) are tests; see
[extending.md](extending.md).

On the Rust side the optional parts (Discord presence, global shortcuts) are Cargo features with
stubs, and the UI asks which exist (`native_modules`) before offering the features that need them.

## Why a second window instead of a child webview

Tauri 2 supports multiple webviews in one window only behind the `unstable` feature. A
separate hidden window is stable on all three platforms, survives Tauri upgrades, and gives us
a natural "show the real site" escape hatch for sign-in and for anything we haven't
re-implemented yet. Revisit when multi-webview stabilises.

## Data: the account is the source of truth

Browse, search, library and account data come from the same InnerTube requests the web app
makes, performed _by the page itself_: the bridge calls `ytmusic-app.networkManager.fetch()`,
so the page attaches its own auth headers and context and our code never sees cookies or
tokens. Raw responses cross IPC as opaque JSON and are parsed in the UI by `@melodesk/adapter`
(versioned parsers, fixture-tested). TanStack Query treats everything as stale immediately and
refetches on window focus; the SQLite-persisted cache only makes the first paint fast.

Playback of anything YouTube gave us an endpoint for is done by handing that endpoint back to
the page (`yt-navigate` event), so queue semantics, history and recommendations are exactly
the website's. The live queue, shuffle/repeat and like state are mirrored from the page's own
store (`store.subscribe`), and "play next"/"add to queue" insert through the same store action
the website uses.

## Native integration (Phase 2)

- **Now Playing, media keys, SMTC.** WKWebView (macOS) and WebView2 (Windows) forward the
  page's Media Session to the OS, so Control Center / Now Playing, the keyboard media keys and
  Windows' System Media Transport Controls work without any code of ours. On Linux,
  `media.rs` publishes MPRIS through souvlaki from the bridge's track/state events.
- **Tray / menu bar.** `native.rs` builds a tray with the current track and play/pause/next/
  previous, a Playback submenu in the macOS app menu, and applies sidebar vibrancy (macOS) or
  Mica/Acrylic (Windows). Closing the window hides it when "close to tray" is on.
- **Shortcuts.** Global combos are user-configurable in Settings and stored with the other
  settings in `settings.json` (tauri-plugin-store); `shortcuts.rs` re-registers on change.
- **Deep links.** `melodesk://watch?v=…`, `melodesk://playlist?list=…`,
  `melodesk://search?q=…`, `melodesk://open?url=<music.youtube.com link>` and plain
  music.youtube.com / youtu.be links are forwarded by `deeplink.rs` (allow-listed hosts only)
  and resolved by `openUrl.ts` into our routes or playback. A second launch with a link is
  routed to the running instance by the single-instance plugin.
- **Not done, and why.** macOS Dock menu controls: Tauri 2.12 has no dock-menu API (only
  dock visibility); the tray menu and Now Playing cover the same controls. Windows taskbar
  thumbnail buttons and jump lists need Win32 code outside Tauri's surface; deferred.
  Handoff needs Apple entitlements and an iOS counterpart; deferred.

- **Equalizer and volume normalization: not available on macOS or Linux.** The only way to
  process the audio without extracting streams (which we never do) is Web Audio on the page's own
  `<video>` via `createMediaElementSource`. Measured in WKWebView on macOS: the context starts
  without a gesture, an oscillator through the same `AnalyserNode` reads full scale, the track
  advances (`readyState` 4), and the element's output is exactly zero. WebKit gives media
  elements fed by Media Source Extensions, which is how YouTube Music streams, digital silence
  when routed through Web Audio. Linux's WebKitGTK shares the engine, so the engine refuses on
  any WebKit (`navigator.vendor` starts with "Apple") before touching the element.
  Re-routing cannot be undone per element, so `inject/audio.ts` is built to fail safe: it never
  routes until asked, only routes once the context is running, refuses DRM media, and if audible
  playback goes silent after routing it records that (localStorage flag) and reloads the player
  once, which restores the plain element. That recovery was exercised on macOS (it cost about five
  seconds of silence, before the WebKit gate existed).
  **Windows (WebView2, Chromium) should work but is untested**, and there is no Settings UI yet;
  the protocol (`setAudio`/`audio`), the engine and the saved-settings plumbing are in place.
  `VITE_AUDIO_SELFTEST=1 pnpm dev` plays a song quietly and steps through EQ and leveling so
  someone on Windows can check the result in the bridge log.
- **Karaoke mode** (`app/KaraokeView.tsx`, `lyrics/karaoke.ts`) is pure UI over the lyrics we
  already have. LRCLIB only has line start times, so words are timed by spreading each line over its
  words by length, and a line's sung length is estimated whenever its "end" is just the next line's
  start (otherwise pauses vanish and the fill creeps across them). YouTube's own timed lyrics carry
  real end times and are honoured. Gaps of 5 s or more, and the intro, show a countdown. It cannot
  remove vocals: that needs audio processing, which is not possible here and not something we do.
- **Offline covers** (`artwork/`): `CachedImg` stores each cover as a blob in IndexedDB after it loads
  and shows the stored copy if the network one fails. 100 MB cap, least-recently-used eviction, a
  Storage section in Settings. The CSP allows `blob:` images and `fetch` to the artwork hosts (they
  send `Access-Control-Allow-Origin: *`; a host that doesn't simply isn't cached). The fetch uses
  `force-cache` to reuse the copy the `<img>` just downloaded.
- **End-to-end tests** run the real UI against `e2e/mock-tauri.ts` (see CONTRIBUTING). They do not
  cover the injected bridge or the native shell; those are covered by unit/Rust tests and by running
  the app.
- **Crossfade** is not attempted: it needs two simultaneous streams or processed audio, and the
  page owns the single player element.

- **Material 3 Expressive colour.** `appearance/material.ts` turns one seed colour (the accent
  preset, a custom colour, or the colour of the current album art) into a complete tonal scheme with
  Google's `@material/material-color-utilities`: `SchemeExpressive`, 2025 spec, so the secondary and
  tertiary colours are hue-shifted from the primary. Only the colour system is Material; the
  components keep their own shapes, type and motion. The library chooses tones so each "on-" colour
  is readable on its container; `tokens.test.ts` re-verifies WCAG AA for every text pairing across
  the presets and awkward seeds (pure yellow, blue, grey, near-black, near-white) in all three themes
  at standard, medium and high contrast. The scheme is written as CSS variables (`--color-primary`,
  `--color-secondary-container`, `--color-surface-container-high`…) and also mapped onto the app's own
  names (`--color-bg`, `--color-fg`, `--color-accent`) so every existing class picks it up. The
  default seed's values live in `packages/ui/src/styles/tokens.css` as generated blocks (regenerate
  with `UPDATE_TOKENS=1`, a test fails if they drift); a non-default scheme is cached in
  localStorage so `public/appearance-init.js` can paint it before React starts.
  **Colour changes cross-fade.** Every colour variable is registered with `@property` as a typed
  `<color>` and the root transitions them (450 ms, off under reduced motion); without registration
  CSS swaps custom properties instantly. The registration is generated too. The library imports its
  own files without extensions, which Node's ESM loader rejects, so `vitest.config.ts` bundles it
  (Vite does that for the app).
- **Global shortcuts are opt-in.** A system-wide shortcut is taken from every app, so the first
  version's defaults (Cmd/Ctrl+Shift+Left/Right/Space) broke text selection everywhere. There are no
  defaults now; saved legacy defaults are cleared on launch (`settings::load`); and
  `shortcuts::conflict` (mirrored in the UI as `shortcutProblem`) refuses arrow/Home/End/delete keys
  with ordinary modifiers, select-all/copy/paste/cut/undo, and bare keys, both when saving and when
  registering. Media keys cover play/pause/next/previous without any of this.

## Gotchas learned the hard way

- `app.security.freezePrototype` must stay **false**: Tauri injects the prototype freeze into
  the remote YouTube webview too, and YouTube's Polymer code then never boots (blank page).
- Rust tests and clippy run with `--no-default-features`; the default `custom-protocol`
  feature embeds the built frontend, which does not exist in test jobs.

## Known risks

- Google may refuse sign-in in a webview it detects as embedded. We set a mainstream user agent
  on the player window; if that stops working, the fallback is unclear and the project should
  stop and reassess rather than reach for workarounds that violate the constraints.
- Idle memory: the YouTube Music web app alone can use 150–300 MB. Measure before promising.
- YouTube changes its markup often. Health checks surface it; versioned selectors contain it.
