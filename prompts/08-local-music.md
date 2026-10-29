# 08 — Local music

## Goal

Play the audio files on the user's computer in the same player bar, queue, Now Playing, lyrics and stats
as everything else. The files are never modified except by the explicit tag editor, and nothing is
downloaded from YouTube.

## Needs

03, 04, 06.

## Constraints

- One source plays at a time (no queue that mixes local and YouTube). Starting a YouTube song stops the
  local one and vice versa (`yield`).
- Rust only walks folders, reads tags/covers/lyrics and hands out file bytes **inside the folders the user
  added**: every path is canonicalized and checked against the roots set by the last `local_scan`; only
  audio extensions are read. A page cannot ask for any other file.
- Playback is an `HTMLAudioElement` fed a blob URL (works the same on every OS and lets Web Audio process
  it). A Rust/decoder engine was considered and rejected.
- What plays depends on the system webview: macOS cannot play Ogg/Opus; those songs are skipped with a
  message and Settings lists what this computer cannot play.

## Build

**Rust** (`src-tauri/src/local.rs`, `lofty` for tags): `local_scan(roots, known)` walks with `walkdir`,
reads title/artist/album/album artist/track/disc/year/genre/duration/has-art/embedded lyrics/ReplayGain
(`REPLAYGAIN_TRACK_GAIN`/`PEAK`), skips files whose mtime is unchanged (`known`), reports batches as
`local:scan-batch` and a summary; `local_read_file`, `local_artwork` (embedded or `cover.*`/`folder.*`),
`local_lyrics_sidecar` (`.lrc`/`.txt` beside the file), `local_write_tags` (title, artist, album, album
artist, track, disc, year, genre, lyrics; WAV has no lyrics slot and the editor says so),
`local_set_active(bool)` and `local_report` (tray/shortcuts/media keys are routed to the local player as
`local:command` events while it is active; `player.rs::dispatch` forwards instead of evaluating in the
YouTube page).

**SQLite** (UI database, `tauri-plugin-sql`): migration `0002_local_music.sql` creates `local_tracks`
(+ folders handled in settings `local:folders`), `0003_local_replaygain.sql` adds `rg_gain`, `rg_peak` and
sets `mtime = 0` to force a rescan. The index can be thrown away at any time.

**UI** (`features/local-music`): `library.ts` (`upsertTracks`, `listSongs/Albums/Artists`, `countTracks`,
`albumTracks`, search with escaped `LIKE`), `scan.ts` (folders, rescan a few seconds after start),
`hooks.ts` (TanStack hooks, never stale since only a scan changes the index), `queue.ts` (pure queue:
start at index, shuffle that keeps the current song first, repeat off/all/one, move/remove), `engine.ts`
(two decks, see 09; resume position; remote tracks for 11; writes `track/state/queue/flags` into the
store with ids `local:<id>`; `deactivate` returns the player to the fallback source and tells `mini`),
`lyrics.ts` (sidecar → tags → lyrics sources), `covers.ts`, `remote.ts` (synthetic negative ids from
`remoteId(key)` for servers/podcasts/radio), `TrackRow`, `LocalPage` (Songs/Albums/Artists/Playlists
tabs), `LocalDetail`, `LocalSettings` (folders, what cannot play), `TagEditor`, `SmartPlaylists` (10).
`player/sourceIds.ts`: `isLocalId`.

Integrations: `PlayerBar`/`ArtistLinks`/`QueuePanel`/lyrics/resume/stats recorders all handle `local:` ids;
`image hosts` treat `blob:` as CORS-capable; the control API (10) reports and drives local playback.

## Acceptance

- Unit: `library.test.ts` (real `node:sqlite` against the migrations), `queue.test.ts`, `dsp.test.ts`.
  Rust: path-in-roots checks, ReplayGain parsing, tag writing round trip (including a real WAV).
- e2e `local-music.e2e.ts` (mock folder with fixture files): empty library invites adding a folder and
  lists songs by artist/album/track; plays, queue, "play next", seek; takeover from YouTube; smart
  playlists; tag editor; EQ/crossfade persistence; no a11y violations.

## Known limits

- **Never played through a real audio device from this environment**; the e2e harness plays generated
  silent clips. Cue sheets, loudness analysis for files without ReplayGain, and a mixed queue are not done.
