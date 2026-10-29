# 02 — The YouTube Music bridge

## Goal

Let the React UI control and observe the official YouTube Music web player without ever touching audio,
sign-in or ads. The player runs in a hidden Tauri webview window (`player`, `https://music.youtube.com`);
a small injected script (the _bridge_) reports what the player is doing and carries out typed commands.

## Needs

00, 01.

## Constraints

- The bridge script runs on every document in the player webview, including Google's sign-in pages. Its
  first line returns unless `location.hostname === 'music.youtube.com'` and it is the top frame. It never
  reads forms, cookies or storage. It uses the page's own network manager for data calls (so the page
  attaches its own auth); our code never sees a token.
- `tauri.conf.json` keeps `"freezePrototype": false`. Freezing prototypes blanks the remote webview.
- The player window is created hidden; closing it **hides** it (playback must survive) and emits
  `player:visible=false`.
- Selectors and page internals are versioned (`inject/selectors.v1.ts`, `page-api.ts`) and feature-
  detected: a missing one degrades the `capabilities`/`health` events, it never throws.

## Build

**Protocol** (`packages/bridge/src/protocol.ts`, Zod, strict, shared by UI and bridge; the Rust command
enum mirrors it):

- Commands (UI → player): `play pause toggle next previous seek{seconds} setVolume{volume 0..1}
setMuted volumeStep toggleMute navigate{path "/…"} requestState skipAd data{requestId,endpoint,body}
probe endpoint{endpoint,mode navigate|service} queueAdd{target,position} setShuffle setRepeat
queueSelect queueRemove queueMove setAutoplay setPlaybackRate setVideoMode{video} setAudio{config}`.
- Events (player → UI, channel `player:event`): `ready{bridgeVersion,protocolVersion,loggedIn}
state{playing,position,duration,volume,muted,sampledAt} track queue flags health{status,reason}
audio navigation{path} dataResponse{requestId,ok,response|error} capabilities{found} log`.
- `PlayerFlags`: `likeStatus`, `playbackRate`, `isVideo`, `adPlaying`, `adSkippable` (default false),
  `videoAvailable` (default true).

**Rust** (`src-tauri/src/player.rs`):

- `create_player_window`: external URL, hidden (visible only with `MELODESK_DEV_SHOW_PLAYER` in debug),
  a per-OS desktop user agent, `initialization_script` = the built bridge IIFE (`include_str!`).
- `player_command`: deserialize into `PlayerCommand` (`deny_unknown_fields`), `validate()` ranges,
  serialize back to JSON, then `eval("window.__melodesk__.dispatch(<json>)")`. `dispatch` is a frozen,
  non-configurable global in the page.
- `player_set_visible`, `player_reload`, `youtube_set_enabled(enabled)` (persisted in the settings store
  under `youtubeEnabled`, default true; off destroys the window, on creates it; native `dispatch` does
  nothing when there is no player window).
- `bridge_emit`: the **only** command the player window may call. It checks the caller's window label,
  bounds the payload size, and forwards the JSON to `main` **without parsing it**. Native observers
  (tray text, media keys, Discord) read from the same stream.

**UI side** (`apps/desktop/src/player/ipc.ts`, feature `youtube-music`): validates every event with
`BridgeEventSchema`; counts rejects; after 10 rejects flips `health` to `degraded/protocol-mismatch`
(the HealthBanner tells the user YouTube probably changed). On attach it sends `requestState`.

**Data calls** (`player/data.ts`): `innertube(endpoint, body)` sends a `data` command with a request id
and resolves from the matching `dataResponse`; 35 s timeout; `rejectAllPending` when the page reloads.
With no source able to answer (YouTube Music off) it rejects at once.

**Page internals the bridge relies on** (all best effort): `#movie_player` (standard player API),
`ytmusic-app` (`navigate`, `queue`, `networkManager`), the Redux store reached through
`app.queue.store.store` (`getState().player`, `queue`, `likeStatus`), `ytmusic-player-bar`,
`ytmusic-av-toggle`. `SET_PLAYER_AUDIO_ONLY` / `SET_PLAYER_PAGE_INFO` dispatches are **no-ops** on the
current page: do not use them (see 07).

Other bridge files: `audio.ts` (optional Web Audio EQ/loudness on the page's media element, reports
`audio` status), `idle-prompt.ts` ("Video paused. Continue watching?" answering), `staleTrack.ts`,
`transport.ts` (`emit` to Rust), `main.ts` (entry), `player-api.ts`.

## Acceptance

- `packages/bridge` tests (protocol parsing, selectors, idle prompt, stale track) pass: 14 tests.
- Rust tests: command enum rejects unknown commands and drops unknown fields; ranges validated.
- Manual: with the bridge attached, the UI shows the track, position, queue, and every transport
  command works.

## Known limits

- Everything depends on YouTube Music's page internals, which can change without notice; that is why the
  health event, capability probing and versioned selectors exist.
- The bridge cannot be exercised without a real signed-in page; CI uses a mocked backend.
