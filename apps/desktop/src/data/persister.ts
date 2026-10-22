import Database from '@tauri-apps/plugin-sql';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Persister } from '@tanstack/react-query-persist-client';

const DB_URL = 'sqlite:melodesk.db';
const KEY = 'query-cache';

let dbPromise: Promise<Database> | null = null;
export function db(): Promise<Database> {
  dbPromise ??= Database.load(DB_URL);
  return dbPromise;
}

/** Query cache persisted in SQLite (settings table), so the last feed paints before the first request completes. */
export const sqlitePersister: Persister = createAsyncStoragePersister({
  key: KEY,
  throttleTime: 2000,
  storage: {
    async getItem(key) {
      const rows = await (
        await db()
      ).select<{ value: string }[]>('SELECT value FROM settings WHERE key = $1', [key]);
      return rows[0]?.value ?? null;
    },
    async setItem(key, value) {
      await (
        await db()
      ).execute(
        'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        [key, value, Date.now()],
      );
    },
    async removeItem(key) {
      await (await db()).execute('DELETE FROM settings WHERE key = $1', [key]);
    },
  },
});

/** Only cache what is worth a fast first paint; never search results or mutations. */
export function shouldPersistQuery(queryKey: readonly unknown[], data?: unknown): boolean {
  const kind = queryKey[0];
  // Lyrics are kept whether or not anything was found: they show offline and save asking again, and
  // a song with none would otherwise go through every source (and the AI helper) on each launch. A
  // miss is looked up again once it is a few minutes old, so a slow source gets another chance.
  if (kind === 'lyrics') return data !== undefined;
  return kind === 'browse' || kind === 'account' || kind === 'library';
}
