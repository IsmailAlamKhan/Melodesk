import type { NewRelease } from '@melodesk/plugins';
import { db } from '../../data/persister';
import { kvGet, kvSet } from '../../data/kv';

const CACHE_KEY = 'radar:cache';
const OFF_KEY = 'radar:dismissed';
/** Look again once a week; the lookups are slow on purpose (the database asks for one a second). */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const RADAR_DAYS = 60;
const ARTIST_COUNT = 15;
const HISTORY_DAYS = 180;

const ARTIST =
  "(CASE WHEN instr(artist, ' • ') > 0 THEN substr(artist, 1, instr(artist, ' • ') - 1) ELSE artist END)";

/** The artists listened to most lately, most played first. */
export async function topArtists(now = Date.now()): Promise<string[]> {
  const rows = await (
    await db()
  ).select<{ name: string }[]>(
    `SELECT ${ARTIST} AS name FROM history WHERE played_at >= $1 AND artist <> '' AND listened_seconds >= 30
      GROUP BY name ORDER BY SUM(listened_seconds) DESC LIMIT ${String(ARTIST_COUNT)}`,
    [now - HISTORY_DAYS * 24 * 60 * 60 * 1000],
  );
  return rows.map((r) => r.name).filter((n) => n.trim() !== '');
}

interface Cache {
  at: number;
  items: NewRelease[];
}

export async function loadCache(): Promise<Cache | null> {
  const raw = await kvGet(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Cache;
    return Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

export const isStale = (cache: Cache | null, now = Date.now()): boolean =>
  !cache || now - cache.at > WEEK_MS;

/** The saved answer if it is fresh, else ask again (and keep the answer a week). */
export async function releases(
  ask: (artists: string[], days: number) => Promise<NewRelease[]>,
  now = Date.now(),
): Promise<NewRelease[]> {
  const cache = await loadCache();
  if (cache && !isStale(cache, now)) return cache.items;
  const artists = await topArtists(now);
  if (artists.length === 0) return cache?.items ?? [];
  const items = await ask(artists, RADAR_DAYS);
  await kvSet(CACHE_KEY, JSON.stringify({ at: now, items } satisfies Cache));
  return items;
}

export const isDismissed = async (): Promise<boolean> => (await kvGet(OFF_KEY)) === '1';
export const dismiss = (): Promise<void> => kvSet(OFF_KEY, '1');
