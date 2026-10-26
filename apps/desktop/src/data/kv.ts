import { db } from './persister';

const changeListeners = new Set<(key: string) => void>();

/** Be told (with the key) after a setting is written or removed; returns the way to stop. */
export function onKvChange(listener: (key: string) => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

const changed = (key: string): void => {
  for (const l of changeListeners) l(key);
};

/** Small key/value store in the local SQLite `settings` table. */
export async function kvGet(key: string): Promise<string | null> {
  const rows = await (
    await db()
  ).select<{ value: string }[]>('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  await (
    await db()
  ).execute(
    'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, value, Date.now()],
  );
  changed(key);
}

export async function kvDel(key: string): Promise<void> {
  await (await db()).execute('DELETE FROM settings WHERE key = $1', [key]);
  changed(key);
}
