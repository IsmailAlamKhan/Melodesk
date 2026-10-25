import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { upsertTracks, type LibraryDb, type ScannedTrack } from './library';
import { compileSmart, smartTracks, type SmartRules } from './smart';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 15, 12);

function fakeDb(): { db: LibraryDb; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_local_music.sql', '0003_local_replaygain.sql'])
    sqlite.exec(readFileSync(resolve(__dirname, '../../../src-tauri/migrations', f), 'utf8'));
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
      select: (sql, b = []) => {
        const { text, values } = prepare(sql, b);
        return Promise.resolve(sqlite.prepare(text).all(...values) as never);
      },
      execute: (sql, b = []) => {
        const { text, values } = prepare(sql, b);
        sqlite.prepare(text).run(...values);
        return Promise.resolve();
      },
    },
  };
}

const song = (path: string, over: Partial<ScannedTrack> = {}): ScannedTrack => ({
  path,
  title: path.replace('/', ''),
  artist: 'Artist',
  album: 'Album',
  albumArtist: null,
  trackNo: null,
  discNo: null,
  year: 2000,
  genre: null,
  durationMs: 180_000,
  mtime: 1,
  size: 1,
  hasArt: false,
  lyrics: null,
  replayGainDb: null,
  replayPeak: null,
  ...over,
});

/** Songs /a../e with an id each (1..5), added on different days. */
async function library(): Promise<ReturnType<typeof fakeDb>> {
  const f = fakeDb();
  // Added 40, 20, 10, 5 and 1 days ago.
  const days = [40, 20, 10, 5, 1];
  for (const [i, name] of ['/a', '/b', '/c', '/d', '/e'].entries())
    await upsertTracks(
      [
        song(name, {
          title: `Song ${name.slice(1).toUpperCase()}`,
          year: 1990 + i * 10,
          genre: i % 2 ? 'Rock' : 'Pop',
        }),
      ],
      f.db,
      NOW - (days[i] ?? 0) * DAY,
    );
  return f;
}

function play(f: ReturnType<typeof fakeDb>, id: number, daysAgo: number, listened = 150): void {
  f.sqlite
    .prepare(
      'INSERT INTO history (video_id, title, artist, album, artwork_url, duration_seconds, played_at, listened_seconds) VALUES (?, ?, ?, NULL, NULL, 200, ?, ?)',
    )
    .run(`local:${String(id)}`, 't', 'a', NOW - daysAgo * DAY, listened);
}

const titles = async (f: ReturnType<typeof fakeDb>, rules: SmartRules): Promise<string[]> =>
  (await smartTracks(rules, f.db, NOW)).map((t) => t.title);

describe('smart playlists', () => {
  it('orders by recently added, and limits', async () => {
    const f = await library();
    expect(await titles(f, { sort: 'recentlyAdded' })).toEqual([
      'Song E',
      'Song D',
      'Song C',
      'Song B',
      'Song A',
    ]);
    expect(await titles(f, { sort: 'recentlyAdded', limit: 2 })).toEqual(['Song E', 'Song D']);
  });

  it('finds what was added lately', async () => {
    const f = await library();
    expect(await titles(f, { addedWithinDays: 12, sort: 'recentlyAdded' })).toEqual([
      'Song E',
      'Song D',
      'Song C',
    ]);
  });

  it('counts only real plays, and finds the never played', async () => {
    const f = await library();
    play(f, 1, 3);
    play(f, 1, 4);
    play(f, 2, 2);
    play(f, 3, 1, 4); // skipped after 4 s: not a play
    expect(await titles(f, { maxPlays: 0, sort: 'title' })).toEqual(['Song C', 'Song D', 'Song E']);
    expect(await titles(f, { minPlays: 2, sort: 'title' })).toEqual(['Song A']);
    expect(await titles(f, { minPlays: 1, sort: 'mostPlayed' })).toEqual(['Song A', 'Song B']);
  });

  it('knows how lately a song was played: forgotten favourites, and this week’s', async () => {
    const f = await library();
    for (const d of [100, 90, 80, 70, 60]) play(f, 1, d); // a favourite, but not lately
    for (const d of [1, 2, 3, 4, 5]) play(f, 2, d); // a favourite, played lately
    expect(await titles(f, { minPlays: 5, notPlayedDays: 30, sort: 'title' })).toEqual(['Song A']);
    expect(await titles(f, { playedWithinDays: 7, sort: 'title' })).toEqual(['Song B']);
    // Never played counts as "not played lately".
    expect(await titles(f, { notPlayedDays: 30, sort: 'title' })).toEqual([
      'Song A',
      'Song C',
      'Song D',
      'Song E',
    ]);
  });

  it('narrows by words, genre, year and length', async () => {
    const f = await library();
    expect(await titles(f, { text: 'song c', sort: 'title' })).toEqual(['Song C']);
    expect(await titles(f, { genre: 'rock', sort: 'title' })).toEqual(['Song B', 'Song D']);
    // Years are 1990, 2000, 2010, 2020 and 2030 for songs A to E.
    expect(await titles(f, { yearFrom: 2000, yearTo: 2020, sort: 'title' })).toEqual([
      'Song B',
      'Song C',
      'Song D',
    ]);
    expect(await titles(f, { minMinutes: 3.5, sort: 'title' })).toEqual([]);
    expect(await titles(f, { maxMinutes: 3.5, sort: 'title' })).toHaveLength(5);
  });

  it('puts the most played first, and shuffles without losing songs', async () => {
    const f = await library();
    play(f, 2, 1);
    play(f, 2, 2);
    play(f, 4, 1);
    expect((await titles(f, { sort: 'mostPlayed' })).slice(0, 2)).toEqual(['Song B', 'Song D']);
    expect((await titles(f, { sort: 'random' })).sort()).toEqual([
      'Song A',
      'Song B',
      'Song C',
      'Song D',
      'Song E',
    ]);
  });

  it('keeps wildcards in the text literal and caps the limit', () => {
    const { sql, values } = compileSmart({ text: '50%_off', sort: 'title', limit: 99999 }, NOW);
    expect(values[0]).toBe('%50\\%\\_off%');
    expect(sql).toContain('LIMIT 500');
    expect(compileSmart({ sort: 'title', limit: 0 }, NOW).sql).toContain('LIMIT 1');
  });

  it('ignores YouTube plays', async () => {
    const f = await library();
    f.sqlite
      .prepare(
        "INSERT INTO history (video_id, title, artist, album, artwork_url, duration_seconds, played_at, listened_seconds) VALUES ('1', 't', 'a', NULL, NULL, 200, ?, 150)",
      )
      .run(NOW);
    expect(await titles(f, { minPlays: 1, sort: 'title' })).toEqual([]);
  });
});
