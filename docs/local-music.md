# Local music

Melodesk plays the music files on your computer next to YouTube Music, in the same player bar, queue
and Now Playing screen. This is the user's own files: nothing is downloaded or taken from YouTube.

## Using it

1. **Local music** in the sidebar → **Add a folder** (or Settings → Storage).
2. The folder, and the folders inside it, are read. New and changed files are picked up on a rescan;
   files that were deleted disappear. A rescan also runs a few seconds after the app starts.
3. Songs, Albums and Artists are listed; click a song to play it from that list. Right-click, or the
   "…" button, adds a song to the queue or plays it next.
4. Lyrics: a `.lrc` (timed) or `.txt` file with the same name beside the song, else the lyrics inside
   its tags, else LRCLIB and the other lyric sources, as for any song.

Formats: MP3, M4A/AAC, FLAC, WAV, AIFF, OGG and Opus are found. What plays depends on the system's
webview: macOS can't play Ogg or Opus (Settings lists what this computer can't play; those songs are
skipped with a message).

## How it fits in

- `src-tauri/src/local.rs` walks the folders and reads tags with `lofty`. It reports what it finds to
  the UI in batches (`local:scan-batch`) and hands over a file's bytes (`local_read_file`), its cover
  (`local_artwork`) and its lyrics file. Every path is checked against the folders the user chose, so a
  page cannot ask for any other file; only audio extensions are read.
- The index is a table in the UI's SQLite database (`local_tracks`, migration 0002), rebuilt by a
  rescan, so it can be thrown away at any time. The files are never modified.
- `features/local-music/engine.ts` plays a file in an audio element of the main window (the bytes are
  put in a blob URL, so it works the same on every OS, and Web Audio can process it). It writes the
  same `track`, `state`, `queue` and `flags` into the player store that the YouTube bridge writes, so
  the player bar, queue, Now Playing, lyrics, stats, sleep timer and keyboard shortcuts work on it
  without knowing the difference. Local ids look like `local:42`.
- `player/router.ts` decides where a command goes: while a local song is playing (`store.source ===
'local'`), playback commands go to the local player; pages and account actions still go to YouTube.
  Starting anything on YouTube stops the local song first. Tray, global shortcuts and media keys are
  routed by Rust (`local_set_active`) to the local player as `local:command` events. The mini player
  gets what the local player is doing through `local:snapshot`.
- One source plays at a time. There is no queue that mixes the two.

## Not done yet

Gapless playback, crossfade and an equalizer for local songs; cue sheets; editing tags; a mixed queue.
