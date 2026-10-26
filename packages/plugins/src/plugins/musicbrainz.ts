import { cleanTitle, plainName } from '../candidates';
import { definePlugin, type NewRelease, type PluginTrack, type SongInfo } from '../sdk';

const API = 'https://musicbrainz.org/ws/2';
/** MusicBrainz asks for no more than one request a second, and for a client name with a way to reach us. */
const SPACING_MS = 1100;
const CLIENT = 'Melodesk (https://github.com/IsmailAlamKhan/Melodesk)';
const DAY_MS = 24 * 60 * 60 * 1000;

interface Recording {
  id?: string;
  title?: string;
  score?: number;
  length?: number;
  'artist-credit'?: { name?: string; artist?: { id?: string; name?: string } }[];
  releases?: { id?: string; title?: string; date?: string }[];
  tags?: { name?: string; count?: number }[];
}

interface ArtistDetail {
  name?: string;
  country?: string;
  type?: string;
  disambiguation?: string;
  'life-span'?: { begin?: string; end?: string; ended?: boolean };
  genres?: { name?: string; count?: number }[];
  tags?: { name?: string; count?: number }[];
}

/** The artist alone from "Artist • Album • Year" and the like. */
export const primaryArtist = (artist: string): string =>
  (artist.split(' • ')[0] ?? artist).split(/\s*(?:,|&| feat\.? | ft\.? | x )\s*/iu)[0]?.trim() ??
  '';

/** A Lucene phrase with its quotes and backslashes escaped. */
const phrase = (text: string): string => `"${text.replace(/[\\"]/gu, ' ').trim()}"`;

export function recordingQuery(title: string, artist: string): string {
  const t = `recording:${phrase(cleanTitle(title) || title)}`;
  return artist ? `${t} AND artist:${phrase(artist)}` : t;
}

/** The best of the recordings that came back: the one whose title and artist are the song's. */
export function pickRecording(
  list: readonly Recording[],
  title: string,
  artist: string,
): Recording | null {
  const wantTitle = plainName(cleanTitle(title) || title);
  const wantArtist = plainName(artist);
  let best: { r: Recording; points: number } | null = null;
  for (const r of list) {
    if (plainName(r.title ?? '') !== wantTitle) continue;
    const credited = (r['artist-credit'] ?? []).map((c) =>
      plainName(c.artist?.name ?? c.name ?? ''),
    );
    const artistOk =
      !wantArtist ||
      credited.some((c) => c === wantArtist || c.includes(wantArtist) || wantArtist.includes(c));
    if (!artistOk) continue;
    const points = (r.score ?? 0) + (r.releases?.length ? 5 : 0);
    if (!best || points > best.points) best = { r, points };
  }
  return best?.r ?? null;
}

const top = (list: { name?: string; count?: number }[] | undefined, n: number): string[] =>
  [...(list ?? [])]
    .filter((g): g is { name: string; count?: number } => !!g.name)
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, n)
    .map((g) => g.name);

/** The earliest release date among the recording's releases (a year, or a full date). */
export function earliestDate(releases: Recording['releases']): string | null {
  const dates = (releases ?? []).map((r) => r.date ?? '').filter((d) => /^\d{4}/u.test(d));
  return dates.sort()[0] ?? null;
}

export function buildInfo(
  track: PluginTrack,
  rec: Recording,
  artist: ArtistDetail | null,
): SongInfo {
  const credit = rec['artist-credit']?.[0]?.artist;
  const life = artist?.['life-span'];
  const begin = life?.begin?.slice(0, 4);
  const end = life?.end?.slice(0, 4);
  const released = earliestDate(rec.releases);
  const album =
    rec.releases?.find((r) => r.date === released)?.title ?? rec.releases?.[0]?.title ?? null;
  return {
    title: rec.title ?? track.title,
    artist: credit?.name ?? primaryArtist(track.artist),
    album,
    released,
    genres: top(rec.tags, 5),
    artistDetails: artist
      ? {
          country: artist.country ?? null,
          kind: artist.type ?? null,
          active: begin ? `${begin} – ${life?.ended ? (end ?? '?') : 'present'}` : null,
          note:
            artist.disambiguation?.trim() === '' ? null : (artist.disambiguation?.trim() ?? null),
          genres: top(artist.genres?.length ? artist.genres : artist.tags, 5),
        }
      : null,
    links: [
      ...(rec.id
        ? [
            {
              label: 'Recording on MusicBrainz',
              url: `https://musicbrainz.org/recording/${rec.id}`,
            },
          ]
        : []),
      ...(credit?.id
        ? [{ label: 'Artist on MusicBrainz', url: `https://musicbrainz.org/artist/${credit.id}` }]
        : []),
    ],
  };
}

/** Whether `date` ("2026", "2026-03", "2026-03-14") falls in the last `days` days before `now` (not in the future). */
export function isRecent(date: string | undefined, days: number, now: number): boolean {
  if (!date || !/^\d{4}(-\d{2}(-\d{2})?)?$/u.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  // A year or a month alone is as precise as it says: take its last day, so it is not dropped too soon.
  const when =
    d !== undefined
      ? Date.UTC(y ?? 0, (m ?? 1) - 1, d)
      : m !== undefined
        ? Date.UTC(y ?? 0, m, 0)
        : Date.UTC(y ?? 0, 11, 31);
  return when <= now && when >= now - days * DAY_MS;
}

/** Facts about songs and artists, and new releases, from MusicBrainz (https://musicbrainz.org), an open music database. */
export const musicbrainz = definePlugin({
  manifest: {
    id: 'musicbrainz',
    name: 'MusicBrainz song info',
    version: '1.0.0',
    description:
      'Shows facts about the song and its artist (release date, country, years active, genres) and new releases from artists you play. Sends the song title and artist, and artist names, to musicbrainz.org.',
    permissions: ['network:fetch', 'storage:plugin'],
    hosts: ['musicbrainz.org'],
    provides: ['info'],
    enabledByDefault: false,
  },
  setup(ctx) {
    const fetch = ctx.fetch;
    let last = 0;
    let queue: Promise<unknown> = Promise.resolve();
    /** One request at a time, a second apart, as MusicBrainz asks. */
    const get = <T>(path: string, params: Record<string, string>): Promise<T | null> => {
      const run = async (): Promise<T | null> => {
        if (!fetch) return null;
        const wait = last + SPACING_MS - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        last = Date.now();
        const query = new URLSearchParams({ ...params, fmt: 'json' });
        const res = await fetch(`${API}/${path}?${query.toString()}`, {
          headers: { 'User-Agent': CLIENT, Accept: 'application/json' },
        });
        return res.ok ? ((await res.json()) as T) : null;
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    };

    const artistId = async (name: string): Promise<string | null> => {
      const key = `artist:${plainName(name)}`;
      const known = await ctx.storage?.get<string>(key);
      if (known) return known;
      const found = await get<{ artists?: { id?: string; name?: string; score?: number }[] }>(
        'artist',
        {
          query: `artist:${phrase(name)}`,
          limit: '3',
        },
      );
      const hit = found?.artists?.find(
        (a) => (a.score ?? 0) >= 90 && plainName(a.name ?? '') === plainName(name),
      );
      if (hit?.id) await ctx.storage?.set(key, hit.id);
      return hit?.id ?? null;
    };

    return {
      songInfo: async (track) => {
        const artist = primaryArtist(track.artist);
        const cacheKey = `info:${plainName(artist)}:${plainName(cleanTitle(track.title))}`;
        const cached = await ctx.storage?.get<{ at: number; info: SongInfo | null }>(cacheKey);
        if (cached && Date.now() - cached.at < 30 * DAY_MS) return cached.info;
        const found = await get<{ recordings?: Recording[] }>('recording', {
          query: recordingQuery(track.title, artist),
          limit: '8',
        });
        const rec = pickRecording(found?.recordings ?? [], track.title, artist);
        if (!found) return null;
        let details: ArtistDetail | null = null;
        const id = rec?.['artist-credit']?.[0]?.artist?.id;
        if (id) details = await get<ArtistDetail>(`artist/${id}`, { inc: 'genres+tags' });
        const info = rec ? buildInfo(track, rec, details) : null;
        await ctx.storage?.set(cacheKey, { at: Date.now(), info });
        return info;
      },

      newReleases: async (artists, days) => {
        const out: NewRelease[] = [];
        const now = Date.now();
        for (const name of artists.slice(0, 25)) {
          const id = await artistId(name);
          if (!id) continue;
          const groups = await get<{
            'release-groups'?: {
              id?: string;
              title?: string;
              'primary-type'?: string;
              'first-release-date'?: string;
            }[];
          }>('release-group', { artist: id, type: 'album|ep|single', limit: '25' });
          for (const g of groups?.['release-groups'] ?? [])
            if (g.id && g.title && isRecent(g['first-release-date'], days, now))
              out.push({
                artist: name,
                title: g.title,
                kind: g['primary-type'] ?? 'Release',
                date: g['first-release-date'] ?? '',
                url: `https://musicbrainz.org/release-group/${g.id}`,
              });
        }
        return out.sort((a, b) => b.date.localeCompare(a.date));
      },
    };
  },
});
