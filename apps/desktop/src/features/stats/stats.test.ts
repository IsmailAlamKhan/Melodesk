import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dayPart, localDay, streaks } from './recap';
import { loadStats, type StatsDb } from './queries';

describe('streaks', () => {
  it('counts consecutive days back from today, or from yesterday', () => {
    const days = ['2026-03-01', '2026-03-02', '2026-03-03'];
    expect(streaks(days, '2026-03-03')).toEqual({ current: 3, longest: 3 });
    // Nothing yet today: the streak is still alive until a whole day passes.
    expect(streaks(days, '2026-03-04')).toEqual({ current: 3, longest: 3 });
    expect(streaks(days, '2026-03-05')).toEqual({ current: 0, longest: 3 });
  });
  it('finds the best run even when it is not the current one, and across month ends', () => {
    const days = ['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02', '2026-02-10'];
    expect(streaks(days, '2026-02-10')).toEqual({ current: 1, longest: 4 });
  });
  it('is zero for no listening and ignores duplicates', () => {
    expect(streaks([], '2026-03-03')).toEqual({ current: 0, longest: 0 });
    expect(streaks(['2026-03-03', '2026-03-03'], '2026-03-03')).toEqual({ current: 1, longest: 1 });
  });
});

describe('dayPart', () => {
  it('names the part of the day with the most listening', () => {
    const hours = Array.from({ length: 24 }, () => 0);
    hours[8] = 600;
    hours[9] = 600;
    hours[20] = 900;
    expect(dayPart(hours)).toBe('morning');
    hours[21] = 900;
    expect(dayPart(hours)).toBe('evening');
  });
  it('is null when nothing was played', () => {
    expect(dayPart(Array.from({ length: 24 }, () => 0))).toBeNull();
  });
});

/** The real history table in an in-memory SQLite, standing in for the app's database. */
function fakeDb(): { conn: StatsDb; add: (r: Row) => void } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    readFileSync(resolve(__dirname, '../../../src-tauri/migrations/0001_init.sql'), 'utf8'),
  );
  const insert = sqlite.prepare(
    'INSERT INTO history (video_id, title, artist, album, artwork_url, duration_seconds, played_at, listened_seconds) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?)',
  );
  return {
    add: (r) => {
      insert.run(r.id, r.title, r.artist, r.duration, r.at, r.listened);
    },
    conn: {
      // The plugin's numbered $1 placeholders, turned into plain ? with the values in order of use.
      select: (sql, bindings = []) => {
        const order: number[] = [];
        const text = sql.replace(/\$(\d+)/gu, (_m, n: string) => {
          order.push(Number(n) - 1);
          return '?';
        });
        const values = order.map((i) => bindings[i] as number | string);
        return Promise.resolve(sqlite.prepare(text).all(...values) as never);
      },
    },
  };
}
interface Row {
  id: string;
  title: string;
  artist: string;
  duration: number;
  at: number;
  listened: number;
}

describe('loadStats', () => {
  const NOW = new Date(2026, 5, 15, 23, 0, 0).getTime();
  const day = (n: number, hour = 20): number => new Date(2026, 5, 15 - n, hour, 0, 0).getTime();

  it('counts a play only once it was listened to for 30 seconds or half the song', async () => {
    const { conn, add } = fakeDb();
    add({ id: 'a', title: 'Real play', artist: 'X', duration: 200, at: day(0), listened: 150 });
    add({ id: 'b', title: 'Skipped', artist: 'X', duration: 200, at: day(0), listened: 3 });
    add({ id: 'c', title: 'Short song', artist: 'X', duration: 20, at: day(0), listened: 12 });
    const s = await loadStats('week', conn, NOW);
    expect(s.plays).toBe(2);
    expect(s.uniqueTracks).toBe(2);
    expect(s.topTracks.map((t) => t.label)).toEqual(['Real play', 'Short song']);
    // Time is time: the skipped seconds still count as listened.
    expect(s.totalSeconds).toBe(165);
  });

  it('adds up one artist across albums, whatever the player put after the name', async () => {
    const { conn, add } = fakeDb();
    add({
      id: 'a',
      title: 'One',
      artist: 'Tanveer Evan • Album A • 2024',
      duration: 200,
      at: day(0),
      listened: 200,
    });
    add({
      id: 'b',
      title: 'Two',
      artist: 'Tanveer Evan • Album B • 2025',
      duration: 200,
      at: day(1),
      listened: 100,
    });
    add({
      id: 'c',
      title: 'Three',
      artist: 'Tanveer Evan',
      duration: 200,
      at: day(2),
      listened: 100,
    });
    add({
      id: 'd',
      title: 'Four',
      artist: 'Someone Else',
      duration: 200,
      at: day(2),
      listened: 50,
    });
    const s = await loadStats('week', conn, NOW);
    expect(s.uniqueArtists).toBe(2);
    expect(s.topArtists[0]).toMatchObject({ label: 'Tanveer Evan', plays: 3, seconds: 400 });
  });

  it('finds streaks, new artists and the time of day', async () => {
    const { conn, add } = fakeDb();
    // Listening on each of the last three evenings, and an old artist from months ago.
    for (let i = 0; i < 3; i += 1)
      add({
        id: `n${String(i)}`,
        title: 'New',
        artist: 'Fresh Artist',
        duration: 200,
        at: day(i),
        listened: 200,
      });
    add({ id: 'o', title: 'Old', artist: 'Old Artist', duration: 200, at: day(90), listened: 200 });
    add({
      id: 'o2',
      title: 'Old',
      artist: 'Old Artist',
      duration: 200,
      at: day(1, 21),
      listened: 200,
    });
    const s = await loadStats('week', conn, NOW);
    expect(s.streak).toEqual({ current: 3, longest: 3 });
    expect(s.newArtists).toBe(1);
    expect(s.dayPart).toBe('evening');
    expect(localDay(NOW)).toBe('2026-06-15');
  });
});
