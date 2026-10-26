import {
  buildFile,
  isPluginSettings,
  isSynced,
  keepingSecrets,
  mergeEntries,
  parseSyncFile,
  withoutSecrets,
  type SyncEntry,
} from './snapshot';

export interface SyncDb {
  select: <T>(sql: string, bindings?: unknown[]) => Promise<T>;
  execute: (sql: string, bindings?: unknown[]) => Promise<unknown>;
}

/** The file in the sync folder. */
export interface SyncIo {
  read: () => Promise<string | null>;
  write: (text: string) => Promise<void>;
}

export interface SyncResult {
  /** Settings this computer took from the file. */
  applied: string[];
  /** Whether the file was rewritten. */
  wrote: boolean;
}

/** This computer's synced settings, with when each last changed. */
export async function collectLocal(db: SyncDb, full = false): Promise<Record<string, SyncEntry>> {
  const rows = await db.select<{ key: string; value: string; updated_at: number | null }[]>(
    'SELECT key, value, updated_at FROM settings',
  );
  const entries: Record<string, SyncEntry> = {};
  for (const r of rows)
    if (isSynced(r.key, full))
      entries[r.key] = {
        value: !full && isPluginSettings(r.key) ? withoutSecrets(r.value) : r.value,
        updatedAt: r.updated_at ?? 0,
      };
  return entries;
}

/**
 * One round: read the file, merge it with this computer's settings, keep the newer value of each,
 * and write the file back if this computer had something newer. Values taken from the file keep the
 * time they were changed (not "now"), so they are not mistaken for new changes and sent round again.
 */
export async function syncOnce(
  db: SyncDb,
  io: SyncIo,
  device: string,
  now: Date = new Date(),
  /** The file is encrypted end to end, so it carries sign-ins and the music server too. */
  full = false,
): Promise<SyncResult> {
  const text = await io.read();
  const remote = text === null ? null : parseSyncFile(text, full);
  if (text !== null && remote === null) throw new Error('not-melodesk-sync-file');
  const local = await collectLocal(db, full);
  const merged = mergeEntries(local, remote?.entries ?? {});
  for (const key of merged.apply) {
    const entry = merged.entries[key];
    if (!entry) continue;
    let value = entry.value;
    if (!full && isPluginSettings(key)) {
      // Their settings, but this computer's own sign-ins stay as they are.
      const rows = await db.select<{ value: string }[]>(
        'SELECT value FROM settings WHERE key = $1',
        [key],
      );
      value = keepingSecrets(value, rows[0]?.value ?? null);
    }
    await db.execute(
      'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [key, value, entry.updatedAt],
    );
  }
  const needsFile = remote === null ? Object.keys(merged.entries).length > 0 : merged.writeFile;
  if (needsFile) await io.write(JSON.stringify(buildFile(merged.entries, device, now), null, 2));
  return { applied: merged.apply, wrote: needsFile };
}
