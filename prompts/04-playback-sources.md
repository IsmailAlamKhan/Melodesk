# 04 — Playback sources

## Goal

What plays is a **source**; YouTube Music is one of them, not the foundation. The player bar, queue,
tray, shortcuts and media keys send every command through one function and do not care which source is
playing.

## Needs

02, 03.

## Constraints

- `src/player/` names no source. Sources register themselves.
- The playing source ignores nothing; a source ignores what the **others** report while it is not the one
  playing.

## Build

`player/backends.ts`:

```ts
interface PlaybackBackend {
  id: string;
  feature?: string; // left out of routing while its feature is off
  handles(cmd): boolean; // answers this while it is the playing source
  starts?(cmd): boolean; // would start something: the playing source steps aside
  fallback?: boolean; // answers when nothing is playing; gets the player back
  send?(cmd): void | Promise<void>; // absent in windows where the source does not run
  yield?(): void; // stop and hand the player back
  attach?(): () => void; // listen to what the source reports (every window)
}
```

- `registerBackend` (returns "put the previous one back"), `allBackends()` (filtered by active
  feature), `fallbackId()`, `attachBackend/detachBackend/attachBackends` (idempotent).
- `resolveRoute(command, active, backends)` is **pure**: the playing source if it `handles`; else a
  source that `starts` it (the playing one `yield`s); else any other source that `handles`; else `null`.
- `sendCommand` (`player/ipc.ts`): resolve, `yield` if told to, then `send`, or if the target has no
  `send` in this window (the mini player) forward to `main` as the Tauri event `local:command` (Rust's
  tray/shortcuts use the same event). Page-data requests with no route throw.
- `player/store.ts` (`usePlayerStore`): generic `source` (string id, `''` until one is playing), `track`,
  `state`, `queue`, `flags`, plus the web player's status fields (`ready`, `loggedIn`, `health`,
  `capabilities`, `audio`, `playerPath`, `playerVisible`, `bridgeVersion`, `rejectedEvents`).
- The mini player is another window: the main window mirrors a local source into it with the Tauri event
  `local:snapshot` (`emitTo('mini', …)`), applied by `subscribeToPlayer`.

**Sources today**

- `features/youtube-music` (`id: 'youtube'`, `fallback`, `handles: () => true`, `starts`: `queueAdd` and
  `endpoint` with `mode: 'navigate'`; `send` = `invoke('player_command')`; `attach` = the bridge listener
  in `backend.ts`; sets `source: 'youtube'` on `state`/`track`). Registered at module import so listeners
  start before anything else (an e2e race otherwise). `start()` attaches and tells Rust it is enabled;
  its disposer detaches, tells Rust it is disabled and clears the store's YouTube state.
- `features/local-music` (`id: 'local'`): `backend.ts` registers the descriptor at import in every window
  (so the mini player knows a local song answers play/pause/seek/volume/queue commands); the main window
  re-registers it with `send`/`yield` when the player starts (08).

YouTube Music is a normal, switchable feature: `home`, `browse`, `search`, `library`, `detail`,
`playlist-import`, `resume`, `audio-engine` declare `dependsOn: ['youtube-music']`. Off: Rust closes the
hidden window (nothing loaded from or sent to YouTube; the choice persists across restarts), those
features deactivate, Layout stops dimming for a player that will never attach, and the app opens on Local
music. The account and diagnostics settings sections live in `features/youtube-music`.

## Acceptance

- `player/backends.test.ts` (routing: fallback, active answers, can't-answer goes elsewhere without
  yielding, starting yields, nobody answers → null).
- e2e `youtube-off.e2e.ts`: off closes the player (`youtube_set_enabled false`), Home/Search disappear,
  Local music stays and is where you land; on brings them back; starting with it off opens on Local music.

## Known limits

- The YouTube data layer (`player/data.ts`, `data/hooks.ts`, `player/actions.ts`) and the web player's
  status fields still live in shared folders, not inside the feature. Cosmetic: nothing depends on them
  being always there any more.
