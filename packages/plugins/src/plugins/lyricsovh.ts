import { definePlugin, type LyricsResult } from '../sdk';

/** Plain (untimed) lyrics from lyrics.ovh, a free public lookup by artist and title. */
export const lyricsovh = definePlugin({
  manifest: {
    id: 'lyricsovh',
    name: 'lyrics.ovh',
    version: '1.0.0',
    description:
      'Plain lyrics, not timed, from lyrics.ovh as a last resort. Sends the track title and artist to api.lyrics.ovh. Its service is free and can be slow.',
    permissions: ['network:fetch'],
    hosts: ['api.lyrics.ovh'],
    provides: ['lyrics'],
  },
  setup(ctx) {
    const fetch = ctx.fetch;
    return {
      lyricsProvider: async (track): Promise<LyricsResult | null> => {
        if (!fetch) return null;
        const artist = track.artist.split(' • ')[0] ?? track.artist;
        const res = await fetch(
          `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(track.title)}`,
        );
        if (!res.ok) return null;
        const body = (await res.json()) as { lyrics?: string };
        const text = (body.lyrics ?? '').replace(/\r\n/gu, '\n').trim();
        // Some entries carry a "Paroles de la chanson …" header line; that is not part of the song.
        const clean = text.replace(/^Paroles de la chanson[^\n]*\n+/iu, '');
        return clean.length > 20
          ? { text: clean, synced: null, source: 'Lyrics from lyrics.ovh' }
          : null;
      },
    };
  },
});
