/**
 * Smart playlists for the local library: a few rules (words, year, how often and how lately a song was
 * played, how new it is, how long) and an order, turned into one SQL query over the library and the
 * listening history. The list is worked out each time it is opened, so it is always up to date.
 */
import { kvGet, kvSet } from '../../data/kv';
import { LOCAL_ID_PREFIX } from '../../player/sourceIds';
import { appDb, likePattern, type LibraryDb, type LocalTrack } from './library';

export type SmartSort =
  'random' | 'mostPlayed' | 'leastPlayed' | 'recentlyAdded' | 'lastPlayed' | 'title' | 'artist';

export interface SmartRules {
  /** Words that must appear in the title, artist, album or genre. */
  text?: string;
  genre?: string;
  yearFrom?: number;
  yearTo?: number;
  /** Played (for 30 s or half the song) at least this many times. */
  minPlays?: number;
  /** At most this many times; 0 means never played. */
  maxPlays?: number;
  /** Not played in the last N days (never played counts). */
  notPlayedDays?: number;
  /** Played in the last N days. */
  playedWithinDays?: number;
  /** Added to the library in the last N days. */
  addedWithinDays?: number;
  minMinutes?: number;
  maxMinutes?: number;
  sort: SmartSort;
  limit?: number;
}

export interface SmartPlaylist {
  id: string;
  name: string;
  rules: SmartRules;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_LIMIT = 500;

/** A play counts like it does in the stats: 30 seconds, or half of a short song. */
const COUNTED =
  '(h.listened_seconds >= 30 OR (h.duration_seconds > 0 AND h.listened_seconds * 2 >= h.duration_seconds))';

const ORDER: Record<SmartSort, string> = {
  random: 'RANDOM()',
  mostPlayed: 'plays DESC, lower(t.title)',
  leastPlayed: 'plays ASC, lower(t.title)',
  recentlyAdded: 't.added_at DESC, t.id DESC',
  lastPlayed: 'COALESCE(last_played, 0) DESC, lower(t.title)',
  title: 'lower(t.title)',
  artist:
    "lower(t.artist), lower(COALESCE(t.album, '')), COALESCE(t.disc_no, 1), COALESCE(t.track_no, 9999)",
};

const whole = (n: number | undefined, min = 0): number | undefined =>
  n !== undefined && Number.isFinite(n) ? Math.max(min, Math.floor(n)) : undefined;

/** The SQL and values for a set of rules, as of `now`. */
export function compileSmart(rules: SmartRules, now: number): { sql: string; values: unknown[] } {
  const where: string[] = [];
  const values: unknown[] = [];
  const add = (clause: string, ...vs: unknown[]): void => {
    let marked = clause;
    for (const v of vs) {
      values.push(v);
      marked = marked.replace('?', `$${String(values.length)}`);
    }
    where.push(marked);
  };
  const text = rules.text?.trim();
  if (text) {
    const like = likePattern(text);
    values.push(like);
    const n = String(values.length);
    where.push(
      `(t.title LIKE $${n} ESCAPE '\\' OR t.artist LIKE $${n} ESCAPE '\\' OR t.album LIKE $${n} ESCAPE '\\' OR t.genre LIKE $${n} ESCAPE '\\')`,
    );
  }
  const genre = rules.genre?.trim();
  if (genre) add("lower(COALESCE(t.genre, '')) = lower(?)", genre);
  const from = whole(rules.yearFrom);
  const to = whole(rules.yearTo);
  if (from !== undefined) add('t.year >= ?', from);
  if (to !== undefined) add('t.year <= ?', to);
  const minPlays = whole(rules.minPlays);
  const maxPlays = whole(rules.maxPlays);
  if (minPlays !== undefined && minPlays > 0) add('COALESCE(s.plays, 0) >= ?', minPlays);
  if (maxPlays !== undefined) add('COALESCE(s.plays, 0) <= ?', maxPlays);
  const notWithin = whole(rules.notPlayedDays);
  if (notWithin !== undefined && notWithin > 0)
    add('(s.last_played IS NULL OR s.last_played < ?)', now - notWithin * DAY_MS);
  const within = whole(rules.playedWithinDays);
  if (within !== undefined && within > 0) add('s.last_played >= ?', now - within * DAY_MS);
  const added = whole(rules.addedWithinDays);
  if (added !== undefined && added > 0) add('t.added_at >= ?', now - added * DAY_MS);
  const minMin = rules.minMinutes !== undefined ? Math.max(0, rules.minMinutes) : undefined;
  const maxMin = rules.maxMinutes !== undefined ? Math.max(0, rules.maxMinutes) : undefined;
  if (minMin !== undefined && minMin > 0) add('t.duration_ms >= ?', Math.round(minMin * 60_000));
  if (maxMin !== undefined && maxMin > 0) add('t.duration_ms <= ?', Math.round(maxMin * 60_000));

  const limit = Math.min(MAX_LIMIT, Math.max(1, whole(rules.limit, 1) ?? MAX_LIMIT));
  const sql = `SELECT t.id, t.path, t.title, t.artist, t.album, t.album_artist, t.track_no, t.disc_no, t.year,
       t.genre, t.duration_ms, t.has_art, t.lyrics, t.rg_gain, t.rg_peak,
       COALESCE(s.plays, 0) AS plays, s.last_played AS last_played
    FROM local_tracks t
    LEFT JOIN (
      SELECT h.video_id AS video_id,
             SUM(CASE WHEN ${COUNTED} THEN 1 ELSE 0 END) AS plays,
             MAX(h.played_at) AS last_played
        FROM history h WHERE h.video_id LIKE '${LOCAL_ID_PREFIX}%' GROUP BY h.video_id
    ) s ON s.video_id = '${LOCAL_ID_PREFIX}' || t.id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${ORDER[rules.sort]}
    LIMIT ${String(limit)}`;
  return { sql, values };
}

interface Row {
  id: number;
  path: string;
  title: string;
  artist: string;
  album: string | null;
  album_artist: string | null;
  track_no: number | null;
  disc_no: number | null;
  year: number | null;
  genre: string | null;
  duration_ms: number;
  has_art: number;
  lyrics: string | null;
  rg_gain: number | null;
  rg_peak: number | null;
}

/** The songs a smart playlist holds right now. */
export async function smartTracks(
  rules: SmartRules,
  conn?: LibraryDb,
  now: number = Date.now(),
): Promise<LocalTrack[]> {
  const c = conn ?? (await appDb());
  const { sql, values } = compileSmart(rules, now);
  const rows = await c.select<Row[]>(sql, values);
  return rows.map((r) => ({
    id: r.id,
    path: r.path,
    title: r.title,
    artist: r.artist,
    album: r.album,
    albumArtist: r.album_artist,
    trackNo: r.track_no,
    discNo: r.disc_no,
    year: r.year,
    genre: r.genre,
    durationMs: r.duration_ms,
    hasArt: r.has_art === 1,
    lyrics: r.lyrics,
    replayGainDb: r.rg_gain,
    replayPeak: r.rg_peak,
  }));
}

const KEY = 'local:smart';

export async function loadSmartPlaylists(): Promise<SmartPlaylist[]> {
  try {
    const raw = await kvGet(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list.flatMap((p: unknown) => {
      const o = (p ?? {}) as Partial<SmartPlaylist>;
      return typeof o.id === 'string' && typeof o.name === 'string' && o.rules
        ? [
            {
              id: o.id,
              name: o.name,
              rules: {
                ...o.rules,
                sort: typeof o.rules.sort === 'string' ? o.rules.sort : 'title',
              },
            },
          ]
        : [];
    });
  } catch {
    return [];
  }
}

export async function saveSmartPlaylists(list: readonly SmartPlaylist[]): Promise<void> {
  await kvSet(KEY, JSON.stringify(list));
}

export const newSmartId = (): string =>
  `sp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Playlists worth offering to start from. Names are message keys (`local.smart.starter.*`). */
export type StarterKey = 'neverPlayed' | 'mostPlayed' | 'recentlyAdded' | 'forgotten';
export const STARTERS: { key: StarterKey; rules: SmartRules }[] = [
  { key: 'neverPlayed', rules: { maxPlays: 0, sort: 'random', limit: 100 } },
  { key: 'mostPlayed', rules: { minPlays: 1, sort: 'mostPlayed', limit: 50 } },
  { key: 'recentlyAdded', rules: { addedWithinDays: 30, sort: 'recentlyAdded', limit: 100 } },
  { key: 'forgotten', rules: { minPlays: 5, notPlayedDays: 30, sort: 'random', limit: 100 } },
];
