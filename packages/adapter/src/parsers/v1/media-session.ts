/**
 * YouTube Music publishes "Artist • Album • Year" (or just "Artist") in
 * `navigator.mediaSession.metadata.artist`. Splitting it here keeps the bridge dumb
 * and the knowledge of YouTube's formatting in one versioned place.
 */
const SEPARATOR = /\s+•\s+/u;

export interface ParsedArtistLine {
  artist: string;
  album: string | null;
  year: number | null;
}

export function parseMediaSessionArtist(raw: string): ParsedArtistLine {
  const parts = raw
    .split(SEPARATOR)
    .map((p) => p.trim())
    .filter(Boolean);
  const artist = parts[0] ?? '';
  let album: string | null = null;
  let year: number | null = null;
  for (const part of parts.slice(1)) {
    if (/^\d{4}$/u.test(part)) {
      year = Number.parseInt(part, 10);
    } else {
      album ??= part;
    }
  }
  return { artist, album, year };
}
