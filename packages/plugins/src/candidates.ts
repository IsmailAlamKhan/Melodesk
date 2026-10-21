import type { PluginTrack } from './sdk';

/** A guess at the song a track really is, for looking up its lyrics. */
export interface SongGuess {
  title: string;
  /** Empty when unknown: lyric sources then search on the title alone. */
  artist: string;
  /** `reported` is what the player says; the rest are guesses, `user` being the listener's own. */
  source: 'reported' | 'cleaned' | 'segment' | 'ai' | 'user';
}

/** Words that mark a part of a title as a description of the upload, not the song's name. */
const NOISE =
  /\b(official|lyrics?|lyrical|video|audio|cover|remix|live|acoustic|unplugged|reprise|version|slowed|reverb|sped\s*up|8d|karaoke|full\s*song|hd|4k|visuali[sz]er|music\s*video|studio|session|mashup|ft\.?|feat\.?|featuring|from\b)/iu;

/** Lowercase letters and digits only, for comparing names. */
export const plainName = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Drop quotes and any (bracketed) part that describes the upload rather than the song. */
export function cleanTitle(raw: string): string {
  return raw
    .replace(/[“”"‘’]/gu, '')
    .replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）/gu, (group) => (NOISE.test(group) ? '' : group))
    .replace(/\s+(ft\.?|feat\.?|featuring)\s+.*$/iu, '')
    .replace(/\s{2,}/gu, ' ')
    .replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/gu, '')
    .trim();
}

/** The parts of a title between "|", " - ", "•" separators. */
function segments(raw: string): string[] {
  return raw
    .split(/\s*[|｜]\s*|\s+[-–—]\s+|\s+•\s+/u)
    .map((s) => cleanTitle(s))
    .filter((s) => s.length >= 2);
}

/** A short all-capitals token such as "RHTDM" is a film or album code, not the song. */
const looksLikeCode = (s: string): boolean => /^[A-Z0-9]{2,7}$/u.test(s.replace(/\s+/gu, ''));

/**
 * The songs a track may be, best guess first. The first is always what the player reports, so a
 * normal song behaves exactly as before. Covers, "(From the film …)" titles and "Artist - Song"
 * uploads add cleaned and split-up guesses, with the artist left blank when it cannot be told.
 */
export function lyricsCandidates(track: PluginTrack): SongGuess[] {
  const reportedArtist = (track.artist.split(' • ')[0] ?? track.artist).trim();
  const artistKey = plainName(reportedArtist);
  const out: SongGuess[] = [];
  const seen = new Set<string>();
  const add = (title: string, artist: string, source: SongGuess['source']): void => {
    const key = `${plainName(title)}|${plainName(artist)}`;
    if (!plainName(title) || seen.has(key)) return;
    seen.add(key);
    out.push({ title, artist, source });
  };

  add(track.title, reportedArtist, 'reported');
  const cleaned = cleanTitle(track.title);
  add(cleaned, reportedArtist, 'cleaned');

  const parts = segments(track.title).filter((s) => {
    const k = plainName(s);
    // The uploader's own name in the title is not part of the song.
    return (
      k !== artistKey && !(artistKey.length > 2 && (k.includes(artistKey) || artistKey.includes(k)))
    );
  });
  const songs = parts.filter((s) => !looksLikeCode(s) && !NOISE.test(s));
  const codes = parts.filter((s) => looksLikeCode(s));
  // "Original Artist - Song" uploaded by someone else: both orders are worth a try.
  if (songs.length === 2 && !artistKey.includes(plainName(songs[0] ?? ''))) {
    add(songs[1] ?? '', songs[0] ?? '', 'segment');
    add(songs[0] ?? '', songs[1] ?? '', 'segment');
  }
  // Looking up by title alone can land on a different song with the same name, so it is only
  // tried for titles that look like an upload of something else (a cover, a film song, a remix).
  const derived = parts.length > 1 || cleaned !== track.title.trim() || NOISE.test(track.title);
  for (const s of songs) {
    add(s, reportedArtist, 'segment');
    if (derived) add(s, '', 'segment');
  }
  if (derived) {
    add(cleaned, '', 'cleaned');
    for (const s of codes) add(s, '', 'segment');
  }
  return out.slice(0, 6);
}
