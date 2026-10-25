import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectBackup,
  isBackedUp,
  parseBackup,
  restoreBackup,
  scrubSecrets,
  type BackupDb,
} from './backup';

function fakeDb(): { db: BackupDb; sqlite: DatabaseSync } {
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
    sqlite,
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
  };
}

const setting = (s: DatabaseSync, key: string, value: string): void => {
  s.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 0)').run(key, value);
};

describe('what is backed up', () => {
  it('leaves out caches and per-plugin secrets', () => {
    expect(isBackedUp('appearance:prefs')).toBe(true);
    expect(isBackedUp('plugin:lastfm:enabled')).toBe(true);
    expect(isBackedUp('plugin:lastfm:store:sessionKey')).toBe(false);
    expect(isBackedUp('query-cache')).toBe(false);
    expect(isBackedUp('resume:last')).toBe(false);
    expect(isBackedUp('lyrics:tr:12-abc|mymemory')).toBe(false);
  });
  it('drops fields that look like secrets from JSON values, and keeps the rest', () => {
    const scrubbed = JSON.parse(
      scrubSecrets(
        '{"user":"me","apiKey":"abc","apiSecret":"x","libreKey":"k","token":"t","theme":"dark"}',
      ),
    ) as Record<string, unknown>;
    expect(scrubbed).toEqual({ user: 'me', theme: 'dark' });
    expect(scrubSecrets('plain text value')).toBe('plain text value');
    expect(scrubSecrets('[1,2,3]')).toBe('[1,2,3]');
  });
});

describe('collect and restore', () => {
  it('round-trips settings and history between two databases', async () => {
    const a = fakeDb();
    setting(a.sqlite, 'appearance:prefs', '{"theme":"ocean"}');
    setting(a.sqlite, 'plugin:lastfm:settings', '{"user":"me","apiKey":"SECRET"}');
    setting(a.sqlite, 'plugin:lastfm:store:sessionKey', 'SESSION');
    setting(a.sqlite, 'query-cache', '{"big":true}');
    a.sqlite
      .prepare(
        'INSERT INTO history (video_id, title, artist, album, artwork_url, duration_seconds, played_at, listened_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('v1', 'Song', 'Artist', null, null, 200, 1000, 150);

    const file = await collectBackup(a.db, true, new Date('2026-01-02T03:04:05Z'));
    expect(file.exportedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(Object.keys(file.settings).sort()).toEqual([
      'appearance:prefs',
      'plugin:lastfm:settings',
    ]);
    expect(JSON.stringify(file)).not.toContain('SECRET');
    expect(JSON.stringify(file)).not.toContain('SESSION');
    expect(file.history).toHaveLength(1);

    const text = JSON.stringify(file);
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const b = fakeDb();
    setting(b.sqlite, 'appearance:prefs', '{"theme":"old"}');
    setting(b.sqlite, 'unrelated', 'kept');
    b.sqlite
      .prepare(
        'INSERT INTO history (video_id, title, artist, album, artwork_url, duration_seconds, played_at, listened_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('old', 'Old', 'X', null, null, 1, 1, 1);
    const done = await restoreBackup(b.db, parsed.file, true, 5);
    expect(done).toEqual({ settings: 2, history: 1 });
    const rows = b.sqlite.prepare('SELECT key, value FROM settings ORDER BY key').all() as {
      key: string;
      value: string;
    }[];
    expect(rows.map((r) => r.key)).toEqual([
      'appearance:prefs',
      'plugin:lastfm:settings',
      'unrelated',
    ]);
    expect(rows[0]?.value).toBe('{"theme":"ocean"}');
    const history = b.sqlite.prepare('SELECT video_id FROM history').all() as {
      video_id: string;
    }[];
    expect(history.map((h) => h.video_id)).toEqual(['v1']);
  });

  it('keeps the current history unless asked to replace it', async () => {
    const b = fakeDb();
    b.sqlite
      .prepare(
        'INSERT INTO history (video_id, title, artist, album, artwork_url, duration_seconds, played_at, listened_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('keep', 'Keep', 'X', null, null, 1, 1, 1);
    const file = {
      app: 'melodesk' as const,
      format: 1 as const,
      exportedAt: '',
      settings: {},
      history: [
        {
          video_id: 'n',
          title: 'N',
          artist: '',
          album: null,
          artwork_url: null,
          duration_seconds: null,
          played_at: 2,
          listened_seconds: 0,
        },
      ],
    };
    await restoreBackup(b.db, file, false);
    expect((b.sqlite.prepare('SELECT video_id FROM history').all() as unknown[]).length).toBe(1);
  });

  it('restores a long history in chunks', async () => {
    const b = fakeDb();
    const history = Array.from({ length: 250 }, (_x, i) => ({
      video_id: `v${String(i)}`,
      title: 'T',
      artist: '',
      album: null,
      artwork_url: null,
      duration_seconds: null,
      played_at: i,
      listened_seconds: 0,
    }));
    const done = await restoreBackup(
      b.db,
      { app: 'melodesk', format: 1, exportedAt: '', settings: {}, history },
      true,
    );
    expect(done.history).toBe(250);
    expect((b.sqlite.prepare('SELECT COUNT(*) AS n FROM history').get() as { n: number }).n).toBe(
      250,
    );
  });
});

describe('parseBackup', () => {
  it('refuses anything that is not a backup', () => {
    expect(parseBackup('hello').ok).toBe(false);
    expect(parseBackup('{"app":"other","format":1}').ok).toBe(false);
    expect(parseBackup('{"app":"melodesk","format":2}').ok).toBe(false);
  });
  it('ignores secrets and caches even if a file carries them', () => {
    const r = parseBackup(
      JSON.stringify({
        app: 'melodesk',
        format: 1,
        settings: { good: 'v', 'plugin:x:store:token': 'bad', 'query-cache': 'bad', n: 5 },
      }),
    );
    expect(r.ok && Object.keys(r.file.settings)).toEqual(['good']);
  });
});
