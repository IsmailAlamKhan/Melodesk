/**
 * What is kept in step between computers, and how two copies are merged. The file holds, for each
 * synced setting, its value and when it last changed; for every setting the newer copy wins, so changes
 * made on two computers at different times both survive and neither computer needs to be "the main one".
 * Only the choices that make sense on any computer are synced: not folder paths, servers, passwords,
 * tokens, caches or listening history (use Back up and restore for those).
 */

/** The settings that are synced, by name. */
const SYNCED = [
  /^appearance:prefs$/u,
  /^audio:prefs$/u,
  /^features:overrides$/u,
  /^lyrics:prefs$/u,
  /^lyrics:offset:/u,
  /^local:smart$/u,
  /^podcasts:feeds$/u,
  /^radio:stations$/u,
  // Which plugins are on, and their settings without the sign-ins (see `scrubSecrets`).
  /^plugin:[^:]+:enabled$/u,
  /^plugin:[^:]+:settings$/u,
];

/** Plugin settings hold sign-ins (a session key, a token): those stay on the computer that made them. */
export const isPluginSettings = (key: string): boolean => /^plugin:[^:]+:settings$/u.test(key);
const SECRET_NAME = /key|secret|token|password|passwd|credential/iu;

const parseObject = (value: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

/** A plugin's saved settings without the fields that look like secrets. */
export function withoutSecrets(value: string): string {
  const obj = parseObject(value);
  if (!obj) return value;
  return JSON.stringify(
    Object.fromEntries(Object.entries(obj).filter(([k]) => !SECRET_NAME.test(k))),
  );
}

/** The settings that came from another computer, with this computer's own sign-ins kept. */
export function keepingSecrets(incoming: string, current: string | null): string {
  const mine = current === null ? null : parseObject(current);
  const theirs = parseObject(incoming);
  if (!mine || !theirs) return incoming;
  const secrets = Object.fromEntries(Object.entries(mine).filter(([k]) => SECRET_NAME.test(k)));
  return JSON.stringify({ ...theirs, ...secrets });
}

/**
 * Kept only when the file is encrypted end to end (the Melodesk sync server): a music server's address,
 * user name and password. With the other places the file can be read by whoever runs them, so these
 * stay on each computer.
 */
const ENCRYPTED_ONLY = [/^server:config$/u];

/** Whether a setting is synced. `full` is the encrypted kind of sync, which also carries sign-ins. */
export const isSynced = (key: string, full = false): boolean =>
  key.length < 256 &&
  (SYNCED.some((re) => re.test(key)) || (full && ENCRYPTED_ONLY.some((re) => re.test(key))));

export interface SyncEntry {
  value: string;
  /** When it last changed, in ms since 1970, by the clock of the computer that changed it. */
  updatedAt: number;
}

export interface SyncFile {
  app: 'melodesk';
  kind: 'sync';
  format: 1;
  /** Which computer wrote this last (a random id, to tell them apart). */
  device: string;
  exportedAt: string;
  entries: Record<string, SyncEntry>;
}

export function buildFile(
  entries: Record<string, SyncEntry>,
  device: string,
  now: Date = new Date(),
): SyncFile {
  return {
    app: 'melodesk',
    kind: 'sync',
    format: 1,
    device,
    exportedAt: now.toISOString(),
    entries,
  };
}

/** The sync file in a text, or null if it is not one of ours (or from a newer version). */
export function parseSyncFile(text: string, full = false): SyncFile | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const o = data as Record<string, unknown>;
  if (o['app'] !== 'melodesk' || o['kind'] !== 'sync' || o['format'] !== 1) return null;
  const entries: Record<string, SyncEntry> = {};
  const raw = o['entries'];
  if (typeof raw === 'object' && raw !== null)
    for (const [key, e] of Object.entries(raw as Record<string, unknown>)) {
      const entry = e as Partial<SyncEntry> | null;
      if (
        isSynced(key, full) &&
        typeof entry?.value === 'string' &&
        typeof entry.updatedAt === 'number' &&
        Number.isFinite(entry.updatedAt)
      )
        entries[key] = { value: entry.value, updatedAt: entry.updatedAt };
    }
  return {
    app: 'melodesk',
    kind: 'sync',
    format: 1,
    device: typeof o['device'] === 'string' ? o['device'].slice(0, 64) : '',
    exportedAt: typeof o['exportedAt'] === 'string' ? o['exportedAt'] : '',
    entries,
  };
}

export interface Merged {
  /** What both computers should hold now. */
  entries: Record<string, SyncEntry>;
  /** The settings in which this computer takes the other's value. */
  apply: string[];
  /** Whether the file needs rewriting (this computer has something the file lacks or has older). */
  writeFile: boolean;
}

/**
 * Merge this computer's settings with the file's. The newer change wins; equal values need nothing;
 * a tie in time (two computers changed it in the same millisecond) goes the same way on both, by value.
 */
export function mergeEntries(
  local: Readonly<Record<string, SyncEntry>>,
  remote: Readonly<Record<string, SyncEntry>>,
): Merged {
  const entries: Record<string, SyncEntry> = {};
  const apply: string[] = [];
  let writeFile = false;
  for (const key of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const mine = local[key];
    const theirs = remote[key];
    if (mine && !theirs) {
      entries[key] = mine;
      writeFile = true;
    } else if (theirs && !mine) {
      entries[key] = theirs;
      apply.push(key);
    } else if (mine && theirs) {
      if (mine.value === theirs.value) {
        entries[key] = mine.updatedAt >= theirs.updatedAt ? mine : theirs;
        continue;
      }
      const takeTheirs =
        theirs.updatedAt > mine.updatedAt ||
        (theirs.updatedAt === mine.updatedAt && theirs.value > mine.value);
      if (takeTheirs) {
        entries[key] = theirs;
        apply.push(key);
      } else {
        entries[key] = mine;
        writeFile = true;
      }
    }
  }
  return { entries, apply, writeFile };
}
