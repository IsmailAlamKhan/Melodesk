import { db } from '../../data/persister';
import { dayPart, localDay, streaks, type DayPart } from './recap';

/** What loadStats needs from the database: the SQL plugin's `select`, or a stand-in in tests. */
export interface StatsDb {
  select: <T>(sql: string, bindings?: unknown[]) => Promise<T>;
}

/**
 * The artist alone: the player reports "Artist • Album • Year", so grouping on the raw text split one
 * artist into a row per album.
 */
const ARTIST =
  "(CASE WHEN instr(artist, ' • ') > 0 THEN substr(artist, 1, instr(artist, ' • ') - 1) ELSE artist END)";
/** A play counts once it has been listened to for 30 seconds or half the song, as for scrobbling. */
const COUNTED =
  '(listened_seconds >= 30 OR (duration_seconds > 0 AND listened_seconds * 2 >= duration_seconds))';

export interface TopEntry {
  key: string;
  label: string;
  sublabel: string | null;
  artworkUrl: string | null;
  plays: number;
  seconds: number;
}
export interface DayBucket {
  day: string;
  seconds: number;
}
export interface StatsSummary {
  range: { from: number; to: number };
  totalSeconds: number;
  plays: number;
  uniqueTracks: number;
  uniqueArtists: number;
  topTracks: TopEntry[];
  topArtists: TopEntry[];
  days: DayBucket[];
  /** Hour-of-day histogram (0..23) in seconds. */
  hours: number[];
  /** Days in a row with listening, counted over all time, and the best run ever. */
  streak: { current: number; longest: number };
  /** Artists first heard in this range (not meaningful for `all`). */
  newArtists: number;
  dayPart: DayPart | null;
}

export type StatsRange = 'week' | 'month' | 'year' | 'all';

export function rangeBounds(range: StatsRange, now = Date.now()): { from: number; to: number } {
  const d = new Date(now);
  const to = now;
  if (range === 'all') return { from: 0, to };
  if (range === 'week') return { from: now - 7 * 86_400_000, to };
  if (range === 'month') return { from: now - 30 * 86_400_000, to };
  d.setFullYear(d.getFullYear() - 1);
  return { from: d.getTime(), to };
}

export async function loadStats(
  range: StatsRange,
  conn: StatsDb | null = null,
  now = Date.now(),
): Promise<StatsSummary> {
  const { from, to } = rangeBounds(range, now);
  const c = conn ?? (await db());
  const between = 'played_at BETWEEN $1 AND $2';
  const args = [from, to];
  const [totals] = await c.select<
    { seconds: number | null; plays: number | null; tracks: number; artists: number }[]
  >(
    `SELECT COALESCE(SUM(listened_seconds), 0) AS seconds,
            SUM(CASE WHEN ${COUNTED} THEN 1 ELSE 0 END) AS plays,
            COUNT(DISTINCT CASE WHEN ${COUNTED} THEN video_id END) AS tracks,
            COUNT(DISTINCT CASE WHEN ${COUNTED} AND artist <> '' THEN ${ARTIST} END) AS artists
       FROM history WHERE ${between}`,
    args,
  );
  const topTracks = await c.select<
    {
      video_id: string;
      title: string;
      artist: string;
      artwork_url: string | null;
      plays: number;
      seconds: number;
    }[]
  >(
    `SELECT video_id, MAX(title) AS title, MAX(artist) AS artist, MAX(artwork_url) AS artwork_url,
            SUM(CASE WHEN ${COUNTED} THEN 1 ELSE 0 END) AS plays, SUM(listened_seconds) AS seconds
       FROM history WHERE ${between} GROUP BY video_id
      HAVING plays > 0 ORDER BY seconds DESC, plays DESC LIMIT 10`,
    args,
  );
  const topArtists = await c.select<
    { name: string; artwork_url: string | null; plays: number; seconds: number }[]
  >(
    `SELECT ${ARTIST} AS name, MAX(artwork_url) AS artwork_url,
            SUM(CASE WHEN ${COUNTED} THEN 1 ELSE 0 END) AS plays, SUM(listened_seconds) AS seconds
       FROM history WHERE ${between} AND artist <> '' GROUP BY name
      HAVING plays > 0 ORDER BY seconds DESC, plays DESC LIMIT 10`,
    args,
  );
  const days = await c.select<{ day: string; seconds: number }[]>(
    `SELECT date(played_at / 1000, 'unixepoch', 'localtime') AS day, SUM(listened_seconds) AS seconds
       FROM history WHERE ${between} GROUP BY day ORDER BY day`,
    args,
  );
  const hourRows = await c.select<{ hour: number; seconds: number }[]>(
    `SELECT CAST(strftime('%H', played_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS hour,
            SUM(listened_seconds) AS seconds
       FROM history WHERE ${between} GROUP BY hour`,
    args,
  );
  const hours = Array.from({ length: 24 }, () => 0);
  for (const h of hourRows) hours[h.hour] = h.seconds;

  // Streaks are about all of the listening, whatever range is shown.
  const everyDay = await c.select<{ day: string }[]>(
    `SELECT DISTINCT date(played_at / 1000, 'unixepoch', 'localtime') AS day
       FROM history WHERE listened_seconds >= 30 ORDER BY day`,
  );
  const [fresh] = await c.select<{ n: number }[]>(
    `SELECT COUNT(*) AS n FROM (
       SELECT ${ARTIST} AS name, MIN(played_at) AS first
         FROM history WHERE artist <> '' AND ${COUNTED} GROUP BY name
     ) WHERE first BETWEEN $1 AND $2`,
    args,
  );
  return {
    range: { from, to },
    totalSeconds: totals?.seconds ?? 0,
    plays: totals?.plays ?? 0,
    uniqueTracks: totals?.tracks ?? 0,
    uniqueArtists: totals?.artists ?? 0,
    topTracks: topTracks.map((t) => ({
      key: t.video_id,
      label: t.title,
      sublabel: t.artist.split(' • ')[0] ?? t.artist,
      artworkUrl: t.artwork_url,
      plays: t.plays,
      seconds: t.seconds,
    })),
    topArtists: topArtists.map((a) => ({
      key: a.name,
      label: a.name,
      sublabel: null,
      artworkUrl: a.artwork_url,
      plays: a.plays,
      seconds: a.seconds,
    })),
    days,
    hours,
    streak: streaks(
      everyDay.map((r) => r.day),
      localDay(now),
    ),
    newArtists: fresh?.n ?? 0,
    dayPart: dayPart(hours),
  };
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${String(m)} min`;
  return `${String(h)} h ${String(m)} min`;
}
