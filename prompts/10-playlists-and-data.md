# 10 — Playlists and data

## Goal

Move playlists in and out, build rule-based playlists for local music, back up and restore the app's
data, and let other programs on this computer control it.

## Needs

04, 05, 08.

## Constraints

- Backups and the control API never include secrets. The control API is **off by default**.

## Build

**Import/export** (`features/playlist-import`, depends on youtube-music; `features/playlist-tools`):
parse M3U/M3U8, CSV, JSON, plain text (`parse.ts`), match each entry to a YouTube Music song by search
(`match.ts`, title cleaning and artist comparison, conservative threshold), create the playlist and add
the matches (`run.ts`), progress dialog (`ImportDialog`), sidebar entry. Export and tools in a playlist
header: sort, merge, remove duplicates, export (`toM3u8`).

**Smart playlists** (`features/local-music/smart.ts`): `SmartRules` (text, genre, yearFrom/To,
min/maxPlays, notPlayedDays, playedWithinDays, addedWithinDays, min/maxMinutes, `sort` one of random,
mostPlayed, leastPlayed, recentlyAdded, lastPlayed, title, artist, `limit` ≤ 500) compiled by
`compileSmart` into **one SQL query that only binds values** over `local_tracks` and `history`;
starters (never played, most played, recently added, forgotten); saved in kv `local:smart`; editor with
a live match count. `rulesFromAi(raw)` whitelists and clamps a model's JSON (see 12).

**Backup/restore** (`features/backup`): `collectBackup` (all `settings` rows except caches and per-plugin
stores, with secret-looking fields removed; optionally listening history), `parseBackup` (format 1, size
limits), `restoreBackup` (settings merged, history optionally replaced in chunks), confirm dialog, reload
after restore. Skipped keys: `query-cache`, `resume:last`, `plugin:*:store:*`, `lyrics:tr:*`.

**Control API** (`features/control-api` + `src-tauri/src/control.rs`): an HTTP server on `127.0.0.1` only,
bearer token, `Origin`/`Host` checks, a pure `route` function and `parse_request`; endpoints for state,
transport, volume, queue; off by default; start/stop commands; the token shown once in Settings. Spec in
`docs/control-api.md`.

## Acceptance

- `playlist-import.test.ts`, `playlistTools.test.ts`, `smart.test.ts` (real SQLite; year range, never
  played, injection attempt stays a bound value), `backup.test.ts` (round trip, secrets scrubbed),
  `control.test.ts` and Rust `control` tests (9: auth, origin, host, routing).
- e2e `playlist-import.e2e.ts` (file → matches → playlist created via the page), `backup.e2e.ts`.

## Known limits

- Playlist matching quality was only tested on fixtures. The control API was not tried from a real
  external client.
