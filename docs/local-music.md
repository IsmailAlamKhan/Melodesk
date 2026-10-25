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

## Sound

Settings → Sound (and the Equalizer tab in Now Playing) has a 10-band equalizer with presets, "Even
out the volume" and crossfade. They apply to local songs on every system, because the files are the
app's own and so their sound can be processed (YouTube Music's sound can't on macOS and Linux; see
[architecture.md](architecture.md)).

- Every audio element goes through a Web Audio graph (`features/local-music/dsp.ts`): per-song
  loudness gain → fade gain → preamp → 10 EQ bands → analyser → output.
- Even volume uses the file's ReplayGain tags (`REPLAYGAIN_TRACK_GAIN`/`PEAK`, read by the scan and kept
  in the index), never boosting a song past clipping. Files without tags are left alone.
- Two audio elements alternate. The next song is read ahead into the idle one, so it starts with no
  wait. With crossfade off it is started about 30 ms before the end (no audible gap); with crossfade on,
  it fades in over the end of the current one.
- The visuals (Visualizer tab, glows, bars) read the analyser, so for local songs they follow the real
  sound, not just the rhythm.

## Editing tags

"Edit info…" in a song's menu writes title, artist, album, album artist, track, disc, year, genre and
lyrics into the file's own tag (`local_write_tags`, with `lofty`). The sound is not touched. WAV files
have no place for lyrics; the editor says so (use a `.lrc` file beside it).

## Not done yet

Cue sheets, loudness analysis for files without ReplayGain tags, and a queue that mixes local and
YouTube songs.
