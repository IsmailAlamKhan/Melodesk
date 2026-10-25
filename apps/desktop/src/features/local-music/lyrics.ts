import { invoke } from '@tauri-apps/api/core';
import { parseLrc, type LyricsResult } from '@melodesk/plugins';
import { lyricsSources } from '../../core';
import { isLocalId, localIdOf } from '../../player/sourceIds';
import { getTrack } from './library';

/** Lyrics text as a result: timed when it has timestamps (a `.lrc`), plain otherwise. */
export function lyricsFromText(text: string, source: string): LyricsResult | null {
  const body = text.trim();
  if (!body) return null;
  const synced = parseLrc(body);
  if (synced.length >= 3) return { text: synced.map((l) => l.text).join('\n'), synced, source };
  return { text: body.replace(/\[[^\]]*\]/gu, '').trim() || body, synced: null, source };
}

/**
 * Lyrics that come with a local song: a `.lrc` or `.txt` file beside it, else the lyrics inside its
 * tags. Songs from YouTube are not its business, and LRCLIB and the others still get a turn when
 * there are none.
 */
export async function lyricsForLocalSong(videoId: string): Promise<LyricsResult | null> {
  if (!isLocalId(videoId)) return null;
  const track = await getTrack(localIdOf(videoId));
  if (!track) return null;
  const sidecar = await invoke<string | null>('local_lyrics_sidecar', { path: track.path }).catch(
    () => null,
  );
  if (sidecar) {
    const found = lyricsFromText(sidecar, 'Lyrics saved next to the file');
    if (found) return found;
  }
  return track.lyrics ? lyricsFromText(track.lyrics, 'Lyrics from the file’s tags') : null;
}

export function registerLocalLyrics(): () => void {
  return lyricsSources.register({
    id: 'local',
    label: 'Local files',
    // Nothing to switch on: it only ever answers for the user's own files.
    isActive: () => true,
    subscribe: () => () => undefined,
    activate: () => undefined,
    fetch: (track) => lyricsForLocalSong(track.videoId),
  });
}
