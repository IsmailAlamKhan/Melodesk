import { kvDel, kvGet, kvSet } from './kv';

/** A listener's own answer to "which song is this?", kept per track for the lyrics lookup. */
export interface LyricsOverride {
  title: string;
  artist: string;
}

export const lyricsOverrideKey = (videoId: string): string => `lyrics:override:${videoId}`;

export async function loadLyricsOverride(videoId: string): Promise<LyricsOverride | null> {
  try {
    const raw = await kvGet(lyricsOverrideKey(videoId));
    const o = raw ? (JSON.parse(raw) as Partial<LyricsOverride>) : null;
    return o?.title ? { title: o.title, artist: o.artist ?? '' } : null;
  } catch {
    return null;
  }
}

export async function saveLyricsOverride(
  videoId: string,
  value: LyricsOverride | null,
): Promise<void> {
  if (value) await kvSet(lyricsOverrideKey(videoId), JSON.stringify(value));
  else await kvDel(lyricsOverrideKey(videoId));
}
