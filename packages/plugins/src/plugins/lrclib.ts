import { plainName } from '../candidates';
import { definePlugin, type PluginTrack } from '../sdk';
import { parseLrc } from '../lrc';

export interface LrclibResponse {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  trackName?: string;
  artistName?: string;
  /** Seconds. */
  duration?: number;
}

/** Lyrics fallback from LRCLIB (https://lrclib.net), a free, open lyrics database. */
export const lrclib = definePlugin({
  manifest: {
    id: 'lrclib',
    name: 'LRCLIB lyrics',
    version: '1.0.0',
    description:
      'Shows lyrics from LRCLIB when YouTube Music has none. Sends the track title, artist and duration to lrclib.net.',
    permissions: ['network:fetch'],
    hosts: ['lrclib.net'],
    provides: ['lyrics'],
    enabledByDefault: false,
  },
  setup(ctx) {
    const fetch = ctx.fetch;
    const headers = { 'Lrclib-Client': 'Melodesk (https://github.com/IsmailAlamKhan/Melodesk)' };
    return {
      lyricsProvider: async (track) => {
        if (!fetch) return null;
        const artist = (track.artist.split(' • ')[0] ?? track.artist).trim();
        if (artist) {
          // The exact lookup, by artist, title and length.
          const params = new URLSearchParams({ track_name: track.title, artist_name: artist });
          if (track.album) params.set('album_name', track.album);
          if (track.durationSeconds)
            params.set('duration', String(Math.round(track.durationSeconds)));
          const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, { headers });
          if (res.ok) return toResult((await res.json()) as LrclibResponse);
          if (res.status !== 404) return null;
        }
        // A looser search: by title alone when the artist is unknown (a cover's original artist is
        // often not what the upload says), and then only a result whose title really matches.
        const query = artist
          ? new URLSearchParams({ track_name: track.title, artist_name: artist })
          : new URLSearchParams({ q: track.title });
        const search = await fetch(`https://lrclib.net/api/search?${query.toString()}`, {
          headers,
        });
        if (!search.ok) return null;
        const best = pickLrclib((await search.json()) as LrclibResponse[], track);
        return best ? toResult(best) : null;
      },
    };
  },
});

/**
 * The search result that is the track: its title has to match, then timed lyrics, the artist and
 * the length (only loosely, since a cover is not the same length as the original) decide. Null
 * when nothing fits, since wrong lyrics are worse than none.
 */
export function pickLrclib(
  list: readonly LrclibResponse[],
  track: PluginTrack,
): LrclibResponse | null {
  const title = plainName(track.title);
  const artist = plainName(track.artist.split(' • ')[0] ?? track.artist);
  let best: { r: LrclibResponse; score: number } | null = null;
  for (const r of list) {
    const name = plainName(r.trackName ?? '');
    if (!name || !(name === title || name.includes(title) || title.includes(name))) continue;
    let score = name === title ? 3 : 1;
    if (r.syncedLyrics) score += 2;
    const by = plainName(r.artistName ?? '');
    if (artist && by && (by.includes(artist) || artist.includes(by))) score += 3;
    if (track.durationSeconds && r.duration) {
      const off = Math.abs(r.duration - track.durationSeconds);
      score += off <= 3 ? 2 : off <= 15 ? 0.5 : -1;
    }
    if (!best || score > best.score) best = { r, score };
  }
  return best && best.score >= 3 ? best.r : null;
}

function toResult(
  r: LrclibResponse,
): { text: string | null; synced: ReturnType<typeof parseLrc> | null; source: string } | null {
  const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : null;
  const text = r.plainLyrics ?? synced?.map((l) => l.text).join('\n') ?? null;
  if (!text && !synced) return null;
  return { text, synced: synced?.length ? synced : null, source: 'Lyrics from LRCLIB' };
}
