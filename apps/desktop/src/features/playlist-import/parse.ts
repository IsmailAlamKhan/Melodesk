/**
 * Reading a playlist from a file: CSV (including the ones Spotify exporters make and our own export),
 * M3U/M3U8, our JSON export, or plain "Artist - Title" lines. What comes out is only text to look up
 * (title, artist, album); no file is ever treated as audio.
 */
export interface ImportEntry {
  title: string;
  artist: string;
  album: string | null;
  /** A YouTube video id, when the file already says which one. */
  videoId: string | null;
  durationSeconds: number | null;
}

const MAX_ENTRIES = 2000;

/** The video id in a YouTube or YouTube Music link, or null. */
export function videoIdFromUrl(text: string): string | null {
  const m =
    /(?:music\.youtube\.com|youtube\.com|youtu\.be)\/(?:watch\?[^\s#]*?v=|shorts\/|)([\w-]{11})(?![\w-])/u.exec(
      text,
    );
  return m?.[1] ?? null;
}

/** Rows of a CSV: quoted cells (with "" for a quote and line breaks inside), comma, semicolon or tab separated. */
export function parseCsvRows(text: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = body.split(/\r?\n/u).find((l) => l.trim() && !l.startsWith('#')) ?? '';
  const delimiter =
    [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0]
      ?.d ?? ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i] ?? '';
    if (quoted) {
      if (c === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && body[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const COLUMNS = {
  title: ['title', 'track name', 'track', 'name', 'song', 'song name', 'track title'],
  artist: ['artists', 'artist', 'artist name(s)', 'artist name', 'artist names', 'performer'],
  album: ['album', 'album name', 'release'],
  videoId: ['video_id', 'videoid', 'video id', 'youtube id'],
  url: ['url', 'link', 'youtube url', 'track uri'],
  duration: ['duration_seconds', 'duration', 'duration (ms)', 'duration_ms'],
} as const;

const find = (header: string[], names: readonly string[]): number =>
  header.findIndex((h) => names.includes(h.trim().toLowerCase()));

/** Several artists in one cell, joined for showing (the first is the one looked for). */
const allArtists = (cell: string): string =>
  cell
    .split(/\s*[;|]\s*/u)
    .map((a) => a.trim())
    .filter(Boolean)
    .join(', ');

export function entriesFromCsv(text: string): ImportEntry[] {
  const rows = parseCsvRows(
    text
      .split(/\r?\n/u)
      .filter((l) => !l.startsWith('#'))
      .join('\n'),
  );
  const header = rows[0] ?? [];
  const ti = find(header, COLUMNS.title);
  if (ti < 0) return [];
  const ai = find(header, COLUMNS.artist);
  const bi = find(header, COLUMNS.album);
  const vi = find(header, COLUMNS.videoId);
  const ui = find(header, COLUMNS.url);
  const di = find(header, COLUMNS.duration);
  const durationUnit = (header[di] ?? '').toLowerCase().includes('ms') ? 1000 : 1;
  const out: ImportEntry[] = [];
  for (const r of rows.slice(1)) {
    const title = (r[ti] ?? '').trim();
    if (!title) continue;
    const idCell = vi >= 0 ? (r[vi] ?? '').trim() : '';
    const seconds = Number((r[di] ?? '').trim());
    out.push({
      title,
      artist: ai >= 0 ? allArtists(r[ai] ?? '') : '',
      album: bi >= 0 ? (r[bi] ?? '').trim() || null : null,
      // An id column wins; otherwise a link column is read for one.
      videoId: /^[\w-]{11}$/u.test(idCell) ? idCell : ui >= 0 ? videoIdFromUrl(r[ui] ?? '') : null,
      durationSeconds: di >= 0 && seconds > 0 ? Math.round(seconds / durationUnit) : null,
    });
  }
  return out;
}

export function entriesFromM3u(text: string): ImportEntry[] {
  const out: ImportEntry[] = [];
  let info: { seconds: number; label: string | null } | null = null;
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    const ext = /^#EXTINF:(-?\d+(?:\.\d+)?)[^,]*,(.*)$/u.exec(line);
    if (ext) {
      const label = (ext[2] ?? '').trim();
      info = { seconds: Number(ext[1]), label: label.length > 0 ? label : null };
      continue;
    }
    if (line.startsWith('#')) continue;
    // A line that is the file or link; the title comes from the EXTINF line before it, or the name.
    const name = decodeURIComponent(line.split(/[\\/]/u).pop() ?? line).replace(
      /\.[A-Za-z0-9]{2,4}$/u,
      '',
    );
    const entry = splitLabel(info?.label ?? name);
    out.push({
      ...entry,
      album: null,
      videoId: videoIdFromUrl(line),
      durationSeconds: info && info.seconds > 0 ? Math.round(info.seconds) : null,
    });
    info = null;
  }
  return out;
}

/** "Artist - Title" into its parts (a label with no dash is only a title). */
export function splitLabel(label: string): { title: string; artist: string } {
  const m = /^(.+?)\s+[-–—]\s+(.+)$/u.exec(label.trim());
  return m
    ? { artist: (m[1] ?? '').trim(), title: (m[2] ?? '').trim() }
    : { artist: '', title: label.trim() };
}

export function entriesFromJson(text: string): ImportEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { tracks?: unknown }).tracks)
      ? (data as { tracks: unknown[] }).tracks
      : [];
  const out: ImportEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const title = typeof o['title'] === 'string' ? o['title'].trim() : '';
    if (!title) continue;
    const artists = Array.isArray(o['artists'])
      ? o['artists'].filter((a): a is string => typeof a === 'string').join(', ')
      : typeof o['artist'] === 'string'
        ? o['artist']
        : '';
    const url = typeof o['url'] === 'string' ? o['url'] : '';
    const id =
      typeof o['videoId'] === 'string' && /^[\w-]{11}$/u.test(o['videoId'])
        ? o['videoId']
        : videoIdFromUrl(url);
    out.push({
      title,
      artist: artists,
      album: typeof o['album'] === 'string' && o['album'] ? o['album'] : null,
      videoId: id,
      durationSeconds: typeof o['durationSeconds'] === 'number' ? o['durationSeconds'] : null,
    });
  }
  return out;
}

export function entriesFromText(text: string): ImportEntry[] {
  return text
    .split(/\r?\n/u)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => ({
      ...splitLabel(l),
      album: null,
      videoId: videoIdFromUrl(l),
      durationSeconds: null,
    }));
}

/** The songs in a file, whatever kind it is (judged by its name, then by what is inside). */
export function parseImport(text: string, fileName: string): ImportEntry[] {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const head = text.trimStart();
  let entries: ImportEntry[];
  if (ext === 'json' || head.startsWith('{') || head.startsWith('['))
    entries = entriesFromJson(text);
  else if (ext === 'm3u' || ext === 'm3u8' || head.startsWith('#EXTM3U'))
    entries = entriesFromM3u(text);
  else if (ext === 'csv' || ext === 'tsv') entries = entriesFromCsv(text);
  else {
    entries = entriesFromCsv(text);
    if (entries.length === 0) entries = entriesFromText(text);
  }
  return entries.slice(0, MAX_ENTRIES);
}

/** A playlist name from a file name: no folder, no extension. */
export function nameFromFile(path: string): string {
  const base = path.split(/[\\/]/u).pop() ?? path;
  return (
    base
      .replace(/\.[A-Za-z0-9]{1,5}$/u, '')
      .replace(/[_]+/gu, ' ')
      .trim() || 'Imported playlist'
  );
}
