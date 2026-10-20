import { db } from '../data/persister';

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

export async function loadStats(range: StatsRange): Promise<StatsSummary> {
  const { from, to } = rangeBounds(range);
  const conn = await db();
  const [totals] = await conn.select<
    { seconds: number | null; plays: number; tracks: number; artists: number }[]
  >(
    'SELECT COALESCE(SUM(listened_seconds),0) AS seconds, COUNT(*) AS plays, COUNT(DISTINCT video_id) AS tracks, COUNT(DISTINCT artist) AS artists FROM history WHERE played_at BETWEEN $1 AND $2',
    [from, to],
  );
  const topTracks = await conn.select<
    {
      video_id: string;
      title: string;
      artist: string;
      artwork_url: string | null;
      plays: number;
      seconds: number;
    }[]
  >(
    'SELECT video_id, MAX(title) AS title, MAX(artist) AS artist, MAX(artwork_url) AS artwork_url, COUNT(*) AS plays, SUM(listened_seconds) AS seconds FROM history WHERE played_at BETWEEN $1 AND $2 GROUP BY video_id ORDER BY seconds DESC, plays DESC LIMIT 10',
    [from, to],
  );
  const topArtists = await conn.select<
    { artist: string; artwork_url: string | null; plays: number; seconds: number }[]
  >(
    "SELECT artist, MAX(artwork_url) AS artwork_url, COUNT(*) AS plays, SUM(listened_seconds) AS seconds FROM history WHERE played_at BETWEEN $1 AND $2 AND artist <> '' GROUP BY artist ORDER BY seconds DESC, plays DESC LIMIT 10",
    [from, to],
  );
  const days = await conn.select<{ day: string; seconds: number }[]>(
    "SELECT date(played_at / 1000, 'unixepoch', 'localtime') AS day, SUM(listened_seconds) AS seconds FROM history WHERE played_at BETWEEN $1 AND $2 GROUP BY day ORDER BY day",
    [from, to],
  );
  const hourRows = await conn.select<{ hour: number; seconds: number }[]>(
    "SELECT CAST(strftime('%H', played_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS hour, SUM(listened_seconds) AS seconds FROM history WHERE played_at BETWEEN $1 AND $2 GROUP BY hour",
    [from, to],
  );
  const hours = Array.from({ length: 24 }, () => 0);
  for (const h of hourRows) hours[h.hour] = h.seconds;
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
      key: a.artist,
      label: a.artist.split(' • ')[0] ?? a.artist,
      sublabel: null,
      artworkUrl: a.artwork_url,
      plays: a.plays,
      seconds: a.seconds,
    })),
    days,
    hours,
  };
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h === 0) return `${String(m)} min`;
  return `${String(h)} h ${String(m)} min`;
}
