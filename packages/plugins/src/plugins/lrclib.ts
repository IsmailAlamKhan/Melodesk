import { definePlugin } from '../sdk';
import { parseLrc } from '../lrc';

interface LrclibResponse {
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
  trackName?: string;
  artistName?: string;
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
    enabledByDefault: false,
  },
  setup(ctx) {
    const fetch = ctx.fetch;
    return {
      lyricsProvider: async (track) => {
        if (!fetch) return null;
        const params = new URLSearchParams({
          track_name: track.title,
          artist_name: track.artist.split(' • ')[0] ?? track.artist,
        });
        if (track.album) params.set('album_name', track.album);
        if (track.durationSeconds)
          params.set('duration', String(Math.round(track.durationSeconds)));
        const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
          headers: { 'Lrclib-Client': 'Melodesk (https://github.com/melodesk/melodesk)' },
        });
        if (res.status === 404) {
          // Fall back to a looser search.
          const search = await fetch(
            `https://lrclib.net/api/search?${new URLSearchParams({ track_name: track.title, artist_name: track.artist.split(' • ')[0] ?? '' }).toString()}`,
          );
          if (!search.ok) return null;
          const list = (await search.json()) as LrclibResponse[];
          const first = list[0];
          if (!first) return null;
          return toResult(first);
        }
        if (!res.ok) return null;
        return toResult((await res.json()) as LrclibResponse);
      },
    };
  },
});

function toResult(
  r: LrclibResponse,
): { text: string | null; synced: ReturnType<typeof parseLrc> | null; source: string } | null {
  const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : null;
  const text = r.plainLyrics ?? synced?.map((l) => l.text).join('\n') ?? null;
  if (!text && !synced) return null;
  return { text, synced: synced?.length ? synced : null, source: 'Lyrics from LRCLIB' };
}
