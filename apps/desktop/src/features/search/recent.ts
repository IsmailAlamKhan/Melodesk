import { kvDel, kvGet, kvSet } from '../../data/kv';

const KEY = 'search:recent';
export const MAX_RECENT = 8;

/** `query` at the front of `list`, once, without case or spacing making duplicates; at most `max`. */
export function pushRecent(list: readonly string[], query: string, max = MAX_RECENT): string[] {
  const q = query.trim().replace(/\s+/gu, ' ');
  if (!q) return [...list];
  const key = q.toLowerCase();
  return [q, ...list.filter((x) => x.toLowerCase() !== key)].slice(0, max);
}

export async function loadRecent(): Promise<string[]> {
  try {
    const raw = await kvGet(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

export async function saveRecent(list: readonly string[]): Promise<void> {
  if (list.length === 0) await kvDel(KEY);
  else await kvSet(KEY, JSON.stringify(list));
}
