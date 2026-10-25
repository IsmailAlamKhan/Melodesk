import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  albumTracks,
  artistTracks,
  countTracks,
  knownFiles,
  likePattern,
  listAlbums,
  listArtists,
  listSongs,
  removeMissing,
  upsertTracks,
  type LibraryDb,
  type ScannedTrack,
} from './library';

/** The real index table in an in-memory SQLite, standing in for the app's database. */
function fakeDb(): LibraryDb {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0002_local_music.sql', '0003_local_replaygain.sql'])
    sqlite.exec(readFileSync(resolve(__dirname, '../../../src-tauri/migrations', file), 'utf8'));
  const prepare = (sql: string, bindings: unknown[]) => {
    // The plugin's numbered $1 placeholders, turned into plain ? with the values in order of use.
    const values: unknown[] = [];
    const text = sql.replace(/\$(\d+)/gu, (_m, n: string) => {
      values.push(bindings[Number(n) - 1]);
      return '?';
    });
    return { text, values: values as (string | number | null)[] };
  };
  return {
    select: (sql, bindings = []) => {
      const { text, values } = prepare(sql, bindings);
      return Promise.resolve(sqlite.prepare(text).all(...values) as never);
    },
    execute: (sql, bindings = []) => {
      const { text, values } = prepare(sql, bindings);
      sqlite.prepare(text).run(...values);
      return Promise.resolve();
    },
  };
}

const track = (over: Partial<ScannedTrack> & { path: string }): ScannedTrack => ({
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  albumArtist: null,
  trackNo: null,
  discNo: null,
  year: null,
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

describe('the local library', () => {
  it('stores songs and updates one when its file changes', async () => {
    const db = fakeDb();
    await upsertTracks([track({ path: '/m/a.mp3', title: 'Old title' })], db);
    await upsertTracks([track({ path: '/m/a.mp3', title: 'New title', mtime: 2 })], db);
    expect(await countTracks(db)).toBe(1);
    expect((await listSongs('', db))[0]?.title).toBe('New title');
    expect(await knownFiles(db)).toEqual([{ path: '/m/a.mp3', mtime: 2, size: 1 }]);
  });

  it('handles a big batch in one go', async () => {
    const db = fakeDb();
    const many = Array.from({ length: 500 }, (_x, i) => track({ path: `/m/${String(i)}.mp3` }));
    await upsertTracks(many, db);
    expect(await countTracks(db)).toBe(500);
  });

  it('forgets songs whose file is gone, and only those', async () => {
    const db = fakeDb();
    await upsertTracks(
      ['/m/a.mp3', '/m/b.mp3', '/m/c.mp3'].map((path) => track({ path })),
      db,
    );
    expect(await removeMissing(['/m/a.mp3', '/m/c.mp3'], db)).toBe(1);
    expect((await knownFiles(db)).map((k) => k.path).sort()).toEqual(['/m/a.mp3', '/m/c.mp3']);
  });

  it('puts an album in track order, disc by disc', async () => {
    const db = fakeDb();
    await upsertTracks(
      [
        track({ path: '/1', title: 'C', trackNo: 1, discNo: 2 }),
        track({ path: '/2', title: 'B', trackNo: 2, discNo: 1 }),
        track({ path: '/3', title: 'A', trackNo: 1, discNo: 1 }),
        track({ path: '/4', title: 'Untagged number' }),
      ],
      db,
    );
    const titles = (await albumTracks('Album', 'Artist', db)).map((t) => t.title);
    // A song with no disc number is on disc 1, and one with no track number comes last on its disc.
    expect(titles).toEqual(['A', 'B', 'Untagged number', 'C']);
  });

  it('groups albums by album and album artist, so two artists’ "Greatest Hits" stay apart', async () => {
    const db = fakeDb();
    await upsertTracks(
      [
        track({ path: '/1', album: 'Greatest Hits', artist: 'X', durationMs: 100_000 }),
        track({ path: '/2', album: 'Greatest Hits', artist: 'X', durationMs: 200_000 }),
        track({ path: '/3', album: 'Greatest Hits', artist: 'Y' }),
        // A compilation: credited to its album artist, whoever sings.
        track({ path: '/4', album: 'Mix', artist: 'P', albumArtist: 'Various' }),
        track({ path: '/5', album: 'Mix', artist: 'Q', albumArtist: 'Various' }),
        track({ path: '/6', album: null, artist: 'Z' }),
      ],
      db,
    );
    const albums = await listAlbums('', db);
    expect(albums.map((a) => `${a.artist}/${a.album}/${String(a.tracks)}`)).toEqual([
      'Various/Mix/2',
      'X/Greatest Hits/2',
      'Y/Greatest Hits/1',
      'Z/Unknown album/1',
    ]);
    expect(albums.find((a) => a.artist === 'X')?.durationMs).toBe(300_000);
    expect(await albumTracks('Mix', 'Various', db)).toHaveLength(2);
    expect(await albumTracks('Unknown album', 'Z', db)).toHaveLength(1);
  });

  it('lists artists with their track and album counts', async () => {
    const db = fakeDb();
    await upsertTracks(
      [
        track({ path: '/1', artist: 'X', album: 'A1' }),
        track({ path: '/2', artist: 'X', album: 'A2' }),
        track({ path: '/3', artist: 'X', album: 'A2' }),
        track({ path: '/4', artist: 'y' }),
      ],
      db,
    );
    const artists = await listArtists('', db);
    expect(artists.map((a) => [a.artist, a.tracks, a.albums])).toEqual([
      ['X', 3, 2],
      ['y', 1, 1],
    ]);
    expect(await artistTracks('X', db)).toHaveLength(3);
  });

  it('searches titles, artists and albums, taking % and _ literally', async () => {
    const db = fakeDb();
    await upsertTracks(
      [
        track({ path: '/1', title: '100% Pure', artist: 'A', album: 'B' }),
        track({ path: '/2', title: 'Other', artist: 'Pure Joy', album: 'B' }),
        track({ path: '/3', title: 'Nothing', artist: 'Q', album: 'The Pure Album' }),
        track({ path: '/4', title: 'Unrelated', artist: 'Q', album: 'R' }),
      ],
      db,
    );
    expect((await listSongs('pure', db)).map((t) => t.title).sort()).toEqual([
      '100% Pure',
      'Nothing',
      'Other',
    ]);
    expect((await listSongs('100%', db)).map((t) => t.title)).toEqual(['100% Pure']);
    expect(await listSongs('%', db)).toHaveLength(1);
    expect(likePattern('50%_off\\')).toBe('%50\\%\\_off\\\\%');
    expect(await listAlbums('joy', db)).toHaveLength(1);
    expect(await listArtists('joy', db)).toHaveLength(1);
  });

  it('keeps the loudness data of a song', async () => {
    const db = fakeDb();
    await upsertTracks([track({ path: '/1', replayGainDb: -7.5, replayPeak: 0.97 })], db);
    const [song] = await listSongs('', db);
    expect(song?.replayGainDb).toBe(-7.5);
    expect(song?.replayPeak).toBe(0.97);
  });
});
