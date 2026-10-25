/**
 * The index of the user's own music files, in SQLite. The files stay where they are; this is only
 * what was read from them (tags, length), so the library can be browsed and searched instantly and
 * rebuilt by a rescan at any time.
 */
import { db } from '../../data/persister';

/** What the library needs from the database: the SQL plugin's calls, or a stand-in in tests. */
export interface LibraryDb {
  select: <T>(sql: string, bindings?: unknown[]) => Promise<T>;
  execute: (sql: string, bindings?: unknown[]) => Promise<unknown>;
}

export async function appDb(): Promise<LibraryDb> {
  return db();
}

/** A song as the scan reports it (see `ScannedTrack` in src-tauri/src/local.rs). */
export interface ScannedTrack {
  path: string;
  title: string;
  artist: string;
  album: string | null;
  albumArtist: string | null;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  genre: string | null;
  durationMs: number;
  mtime: number;
  size: number;
  hasArt: boolean;
  lyrics: string | null;
  replayGainDb: number | null;
  replayPeak: number | null;
}

export interface LocalTrack {
  id: number;
  path: string;
  title: string;
  artist: string;
  album: string | null;
  albumArtist: string | null;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  genre: string | null;
  durationMs: number;
  hasArt: boolean;
  lyrics: string | null;
  replayGainDb: number | null;
  replayPeak: number | null;
}

interface Row {
  id: number;
  path: string;
  title: string;
  artist: string;
  album: string | null;
  album_artist: string | null;
  track_no: number | null;
  disc_no: number | null;
  year: number | null;
  genre: string | null;
  duration_ms: number;
  has_art: number;
  lyrics: string | null;
  rg_gain: number | null;
  rg_peak: number | null;
}

const COLUMNS =
  'id, path, title, artist, album, album_artist, track_no, disc_no, year, genre, duration_ms, has_art, lyrics, rg_gain, rg_peak';

const toTrack = (r: Row): LocalTrack => ({
  id: r.id,
  path: r.path,
  title: r.title,
  artist: r.artist,
  album: r.album,
  albumArtist: r.album_artist,
  trackNo: r.track_no,
  discNo: r.disc_no,
  year: r.year,
  genre: r.genre,
  durationMs: r.duration_ms,
  hasArt: r.has_art === 1,
  lyrics: r.lyrics,
  replayGainDb: r.rg_gain,
  replayPeak: r.rg_peak,
});

/** The album a song is shown under, and who it is credited to (the album artist, else the artist). */
const ALBUM = "COALESCE(NULLIF(album, ''), 'Unknown album')";
const ALBUM_ARTIST = "COALESCE(NULLIF(album_artist, ''), artist)";
/** Album order, then disc and track, then title. */
const ORDER_IN_ALBUM = 'ORDER BY COALESCE(disc_no, 1), COALESCE(track_no, 9999), lower(title)';

export const UNKNOWN_ALBUM = 'Unknown album';

// SQLite allows at least 999 bound values per statement in every build; a row takes 16.
const UPSERT_ROWS = 60;
const DELETE_ROWS = 500;

/** Add new songs and update changed ones (matched by path). */
export async function upsertTracks(
  tracks: readonly ScannedTrack[],
  conn?: LibraryDb,
  now: number = Date.now(),
): Promise<void> {
  const c = conn ?? (await appDb());
  for (let i = 0; i < tracks.length; i += UPSERT_ROWS) {
    const chunk = tracks.slice(i, i + UPSERT_ROWS);
    const values: unknown[] = [];
    const rows = chunk.map((t, r) => {
      values.push(
        t.path,
        t.title,
        t.artist,
        t.album,
        t.albumArtist,
        t.trackNo,
        t.discNo,
        t.year,
        t.genre,
        t.durationMs,
        t.mtime,
        t.size,
        t.hasArt ? 1 : 0,
        t.lyrics,
        t.replayGainDb,
        t.replayPeak,
      );
      const base = r * 16;
      const marks = Array.from({ length: 16 }, (_x, k) => `$${String(base + k + 1)}`).join(', ');
      return `(${marks}, ${String(now)})`;
    });
    await c.execute(
      `INSERT INTO local_tracks (path, title, artist, album, album_artist, track_no, disc_no, year, genre, duration_ms, mtime, size, has_art, lyrics, rg_gain, rg_peak, added_at)
       VALUES ${rows.join(', ')}
       ON CONFLICT(path) DO UPDATE SET title = excluded.title, artist = excluded.artist, album = excluded.album,
         album_artist = excluded.album_artist, track_no = excluded.track_no, disc_no = excluded.disc_no,
         year = excluded.year, genre = excluded.genre, duration_ms = excluded.duration_ms, mtime = excluded.mtime,
         size = excluded.size, has_art = excluded.has_art, lyrics = excluded.lyrics,
         rg_gain = excluded.rg_gain, rg_peak = excluded.rg_peak`,
      values,
    );
  }
}

/** Forget songs whose file is gone (not in `seen`). Returns how many were forgotten. */
export async function removeMissing(seen: readonly string[], conn?: LibraryDb): Promise<number> {
  const c = conn ?? (await appDb());
  const keep = new Set(seen);
  const rows = await c.select<{ path: string }[]>('SELECT path FROM local_tracks');
  const gone = rows.map((r) => r.path).filter((p) => !keep.has(p));
  for (let i = 0; i < gone.length; i += DELETE_ROWS) {
    const chunk = gone.slice(i, i + DELETE_ROWS);
    const marks = chunk.map((_p, k) => `$${String(k + 1)}`).join(', ');
    await c.execute(`DELETE FROM local_tracks WHERE path IN (${marks})`, chunk);
  }
  return gone.length;
}

/** Forget every song (the library folders were all removed). */
export async function clearLibrary(conn?: LibraryDb): Promise<void> {
  await (conn ?? (await appDb())).execute('DELETE FROM local_tracks');
}

export async function knownFiles(
  conn?: LibraryDb,
): Promise<{ path: string; mtime: number; size: number }[]> {
  const c = conn ?? (await appDb());
  return c.select('SELECT path, mtime, size FROM local_tracks');
}

export async function countTracks(conn?: LibraryDb): Promise<number> {
  const c = conn ?? (await appDb());
  const rows = await c.select<{ n: number }[]>('SELECT COUNT(*) AS n FROM local_tracks');
  return rows[0]?.n ?? 0;
}

/** Text for a LIKE that matches `q` anywhere, with the wildcards in `q` taken literally. */
export const likePattern = (q: string): string => `%${q.replace(/[\\%_]/gu, (m) => `\\${m}`)}%`;

const SEARCH =
  "(title LIKE $1 ESCAPE '\\' OR artist LIKE $1 ESCAPE '\\' OR album LIKE $1 ESCAPE '\\')";

/** Every song, by artist then album then track; narrowed to those matching `query`. */
export async function listSongs(query = '', conn?: LibraryDb): Promise<LocalTrack[]> {
  const c = conn ?? (await appDb());
  const q = query.trim();
  const order = `ORDER BY lower(artist), lower(${ALBUM}), COALESCE(disc_no, 1), COALESCE(track_no, 9999), lower(title)`;
  const rows = q
    ? await c.select<Row[]>(`SELECT ${COLUMNS} FROM local_tracks WHERE ${SEARCH} ${order}`, [
        likePattern(q),
      ])
    : await c.select<Row[]>(`SELECT ${COLUMNS} FROM local_tracks ${order}`);
  return rows.map(toTrack);
}

export async function getTrack(id: number, conn?: LibraryDb): Promise<LocalTrack | null> {
  const c = conn ?? (await appDb());
  const rows = await c.select<Row[]>(`SELECT ${COLUMNS} FROM local_tracks WHERE id = $1`, [id]);
  return rows[0] ? toTrack(rows[0]) : null;
}

export interface AlbumSummary {
  album: string;
  artist: string;
  tracks: number;
  durationMs: number;
  year: number | null;
  /** A file of the album, to take the cover from. */
  coverPath: string;
}

export async function listAlbums(query = '', conn?: LibraryDb): Promise<AlbumSummary[]> {
  const c = conn ?? (await appDb());
  const q = query.trim();
  const rows = await c.select<
    {
      album: string;
      artist: string;
      tracks: number;
      duration_ms: number;
      year: number | null;
      cover_path: string;
    }[]
  >(
    `SELECT ${ALBUM} AS album, ${ALBUM_ARTIST} AS artist, COUNT(*) AS tracks, SUM(duration_ms) AS duration_ms,
            MIN(year) AS year, MIN(path) AS cover_path
       FROM local_tracks ${q ? `WHERE ${SEARCH}` : ''}
      GROUP BY ${ALBUM}, ${ALBUM_ARTIST}
      ORDER BY lower(${ALBUM_ARTIST}), lower(${ALBUM})`,
    q ? [likePattern(q)] : [],
  );
  return rows.map((r) => ({
    album: r.album,
    artist: r.artist,
    tracks: r.tracks,
    durationMs: r.duration_ms,
    year: r.year,
    coverPath: r.cover_path,
  }));
}

export async function albumTracks(
  album: string,
  artist: string,
  conn?: LibraryDb,
): Promise<LocalTrack[]> {
  const c = conn ?? (await appDb());
  const rows = await c.select<Row[]>(
    `SELECT ${COLUMNS} FROM local_tracks WHERE ${ALBUM} = $1 AND ${ALBUM_ARTIST} = $2 ${ORDER_IN_ALBUM}`,
    [album, artist],
  );
  return rows.map(toTrack);
}

export interface ArtistSummary {
  artist: string;
  tracks: number;
  albums: number;
  coverPath: string;
}

export async function listArtists(query = '', conn?: LibraryDb): Promise<ArtistSummary[]> {
  const c = conn ?? (await appDb());
  const q = query.trim();
  const rows = await c.select<
    { artist: string; tracks: number; albums: number; cover_path: string }[]
  >(
    `SELECT artist, COUNT(*) AS tracks, COUNT(DISTINCT ${ALBUM}) AS albums, MIN(path) AS cover_path
       FROM local_tracks ${q ? `WHERE ${SEARCH}` : ''}
      GROUP BY artist
      ORDER BY lower(artist)`,
    q ? [likePattern(q)] : [],
  );
  return rows.map((r) => ({
    artist: r.artist,
    tracks: r.tracks,
    albums: r.albums,
    coverPath: r.cover_path,
  }));
}

export async function artistTracks(artist: string, conn?: LibraryDb): Promise<LocalTrack[]> {
  const c = conn ?? (await appDb());
  const rows = await c.select<Row[]>(
    `SELECT ${COLUMNS} FROM local_tracks WHERE artist = $1
      ORDER BY lower(${ALBUM}), COALESCE(disc_no, 1), COALESCE(track_no, 9999), lower(title)`,
    [artist],
  );
  return rows.map(toTrack);
}
