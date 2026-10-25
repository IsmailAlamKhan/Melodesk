/**
 * Back up and restore what lives in the local database: settings, themes, plugin choices, lyrics
 * corrections, folders and (if asked) the listening history. Passwords, keys and tokens are left out of
 * the file, so it is safe to keep or share; they are typed in again after a restore. Caches (covers,
 * the page cache, the local music index) are not part of it: they rebuild themselves.
 */

export interface BackupDb {
  select: <T>(sql: string, bindings?: unknown[]) => Promise<T>;
  execute: (sql: string, bindings?: unknown[]) => Promise<unknown>;
}

export interface HistoryRow {
  video_id: string;
  title: string;
  artist: string;
  album: string | null;
  artwork_url: string | null;
  duration_seconds: number | null;
  played_at: number;
  listened_seconds: number;
}

export interface BackupFile {
  app: 'melodesk';
  format: 1;
  exportedAt: string;
  settings: Record<string, string>;
  history?: HistoryRow[];
}

/** Settings that are caches or per-session state, not choices. */
const SKIPPED = [/^query-cache$/u, /^resume:last$/u, /^plugin:[^:]+:store:/u, /^lyrics:tr:/u];
const SECRET_NAME = /key|secret|token|password|passwd|credential/iu;

export const isBackedUp = (key: string): boolean => !SKIPPED.some((re) => re.test(key));

/** A stored value without the fields that look like secrets (anything named key, secret, token, password). */
export function scrubSecrets(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const clean = Object.fromEntries(
        Object.entries(parsed).filter(([name]) => !SECRET_NAME.test(name)),
      );
      return JSON.stringify(clean);
    }
  } catch {
    /* not JSON: a plain value */
  }
  return value;
}

export async function collectBackup(
  db: BackupDb,
  includeHistory: boolean,
  now: Date = new Date(),
): Promise<BackupFile> {
  const rows = await db.select<{ key: string; value: string }[]>(
    'SELECT key, value FROM settings ORDER BY key',
  );
  const settings: Record<string, string> = {};
  for (const r of rows) if (isBackedUp(r.key)) settings[r.key] = scrubSecrets(r.value);
  const file: BackupFile = { app: 'melodesk', format: 1, exportedAt: now.toISOString(), settings };
  if (includeHistory)
    file.history = await db.select<HistoryRow[]>(
      'SELECT video_id, title, artist, album, artwork_url, duration_seconds, played_at, listened_seconds FROM history ORDER BY played_at',
    );
  return file;
}

/** The backup in a file's text, or an error message if it is not one of ours. */
export function parseBackup(
  text: string,
): { ok: true; file: BackupFile } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not a Melodesk backup (it is not valid JSON)' };
  }
  const o = (data ?? {}) as Record<string, unknown>;
  if (o['app'] !== 'melodesk' || o['format'] !== 1)
    return { ok: false, error: 'not a Melodesk backup, or one from a newer version' };
  const settingsIn = (o['settings'] ?? {}) as Record<string, unknown>;
  const settings: Record<string, string> = {};
  for (const [k, v] of Object.entries(settingsIn))
    if (typeof v === 'string' && isBackedUp(k) && k.length < 256) settings[k] = v;
  const file: BackupFile = {
    app: 'melodesk',
    format: 1,
    exportedAt: typeof o['exportedAt'] === 'string' ? o['exportedAt'] : '',
    settings,
  };
  if (Array.isArray(o['history'])) {
    file.history = (o['history'] as Record<string, unknown>[]).flatMap((r) =>
      typeof r['video_id'] === 'string' &&
      typeof r['title'] === 'string' &&
      typeof r['played_at'] === 'number'
        ? [
            {
              video_id: r['video_id'],
              title: r['title'],
              artist: typeof r['artist'] === 'string' ? r['artist'] : '',
              album: typeof r['album'] === 'string' ? r['album'] : null,
              artwork_url: typeof r['artwork_url'] === 'string' ? r['artwork_url'] : null,
              duration_seconds:
                typeof r['duration_seconds'] === 'number' ? r['duration_seconds'] : null,
              played_at: r['played_at'],
              listened_seconds:
                typeof r['listened_seconds'] === 'number' ? r['listened_seconds'] : 0,
            },
          ]
        : [],
    );
  }
  return { ok: true, file };
}

const HISTORY_CHUNK = 80;

/**
 * Put a backup back. Settings in the file replace those with the same name (others stay); history, if
 * the file has it and `replaceHistory` is set, replaces the current history.
 */
export async function restoreBackup(
  db: BackupDb,
  file: BackupFile,
  replaceHistory: boolean,
  now: number = Date.now(),
): Promise<{ settings: number; history: number }> {
  let settings = 0;
  for (const [key, value] of Object.entries(file.settings)) {
    await db.execute(
      'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [key, value, now],
    );
    settings += 1;
  }
  let history = 0;
  if (replaceHistory && file.history) {
    await db.execute('DELETE FROM history');
    for (let i = 0; i < file.history.length; i += HISTORY_CHUNK) {
      const chunk = file.history.slice(i, i + HISTORY_CHUNK);
      const values: unknown[] = [];
      const rows = chunk.map((r, n) => {
        values.push(
          r.video_id,
          r.title,
          r.artist,
          r.album,
          r.artwork_url,
          r.duration_seconds,
          r.played_at,
          r.listened_seconds,
        );
        const base = n * 8;
        return `(${Array.from({ length: 8 }, (_x, k) => `$${String(base + k + 1)}`).join(', ')})`;
      });
      await db.execute(
        `INSERT INTO history (video_id, title, artist, album, artwork_url, duration_seconds, played_at, listened_seconds) VALUES ${rows.join(', ')}`,
        values,
      );
      history += chunk.length;
    }
  }
  return { settings, history };
}
