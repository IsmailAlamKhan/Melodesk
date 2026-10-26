import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectLocal, syncOnce, type SyncDb, type SyncIo } from './engine';

/** One computer's settings table, in a real SQLite. */
function computer(): {
  db: SyncDb;
  set: (key: string, value: string, at: number) => void;
  get: (key: string) => string | undefined;
} {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    readFileSync(resolve(__dirname, '../../../src-tauri/migrations/0001_init.sql'), 'utf8'),
  );
  const prepare = (sql: string, bindings: unknown[]) => {
    const values: unknown[] = [];
    const text = sql.replace(/\$(\d+)/gu, (_m, n: string) => {
      values.push(bindings[Number(n) - 1]);
      return '?';
    });
    return { text, values: values as (string | number | null)[] };
  };
  return {
    db: {
      select: (sql, bindings = []) => {
        const { text, values } = prepare(sql, bindings);
        return Promise.resolve(sqlite.prepare(text).all(...values) as never);
      },
      execute: (sql, bindings = []) => {
        const { text, values } = prepare(sql, bindings);
        sqlite.prepare(text).run(...values);
        return Promise.resolve();
      },
    },
    set: (key, value, at) => {
      sqlite
        .prepare(
          'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
        )
        .run(key, value, at);
    },
    get: (key) =>
      (
        sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
          { value: string } | undefined
      )?.value,
  };
}

/** The shared folder: one file both computers read and write. */
function folder(): SyncIo & { text: () => string | null; writes: () => number } {
  let content: string | null = null;
  let writes = 0;
  return {
    read: () => Promise.resolve(content),
    write: (t) => {
      content = t;
      writes += 1;
      return Promise.resolve();
    },
    text: () => content,
    writes: () => writes,
  };
}

describe('syncing two computers through a folder', () => {
  it('starts the file from the first computer, and gives it to the second', async () => {
    const a = computer();
    const b = computer();
    const io = folder();
    a.set('audio:prefs', '{"volume":1}', 100);
    a.set('server:config', 'not synced', 100);
    expect(await syncOnce(a.db, io, 'a')).toEqual({ applied: [], wrote: true });
    expect(io.text()).not.toContain('not synced');
    const got = await syncOnce(b.db, io, 'b');
    expect(got.applied).toEqual(['audio:prefs']);
    expect(b.get('audio:prefs')).toBe('{"volume":1}');
    expect(b.get('server:config')).toBeUndefined();
    // The time it was changed travels with it, so the second computer does not send it round again.
    expect((await collectLocal(b.db))['audio:prefs']?.updatedAt).toBe(100);
    expect(got.wrote).toBe(false);
  });

  it('keeps the newer change in each setting and the other computer follows', async () => {
    const a = computer();
    const b = computer();
    const io = folder();
    a.set('audio:prefs', 'old', 100);
    a.set('lyrics:prefs', 'a-newer', 300);
    await syncOnce(a.db, io, 'a');
    await syncOnce(b.db, io, 'b');
    b.set('audio:prefs', 'b-newer', 200);
    b.set('lyrics:prefs', 'b-older', 250);
    const second = await syncOnce(b.db, io, 'b');
    expect(second.applied).toEqual(['lyrics:prefs']);
    expect(b.get('lyrics:prefs')).toBe('a-newer');
    expect(b.get('audio:prefs')).toBe('b-newer');
    const third = await syncOnce(a.db, io, 'a');
    expect(third.applied).toEqual(['audio:prefs']);
    expect(a.get('audio:prefs')).toBe('b-newer');
  });

  it('writes nothing when there is nothing new', async () => {
    const a = computer();
    const io = folder();
    a.set('audio:prefs', 'x', 100);
    await syncOnce(a.db, io, 'a');
    const before = io.writes();
    await syncOnce(a.db, io, 'a');
    expect(io.writes()).toBe(before);
  });

  it('does not write an empty file for a computer with nothing to sync', async () => {
    const io = folder();
    expect(await syncOnce(computer().db, io, 'a')).toEqual({ applied: [], wrote: false });
    expect(io.text()).toBeNull();
  });

  it('refuses a file that is not ours rather than overwriting it', async () => {
    const a = computer();
    a.set('audio:prefs', 'x', 100);
    const io = {
      read: () => Promise.resolve('hello'),
      write: () => Promise.reject(new Error('should not write')),
    };
    await expect(syncOnce(a.db, io, 'a')).rejects.toThrow('not-melodesk-sync-file');
  });
});
