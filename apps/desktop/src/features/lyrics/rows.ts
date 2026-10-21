/** Pure helpers for lyrics display: rows, sync lookup, chunking for translation. */
import type { Lyrics } from '@melodesk/adapter';

export interface LyricsRow {
  text: string;
  /** Present for timed lyrics. */
  startMs?: number;
  endMs?: number;
}

export interface LyricsData extends Lyrics {
  origin: 'youtube' | 'plugin';
}

export function rowsFromLyrics(l: Pick<Lyrics, 'text' | 'synced'>): LyricsRow[] {
  if (l.synced?.length)
    return l.synced.map((s) => ({ text: s.text, startMs: s.startMs, endMs: s.endMs }));
  return (l.text ?? '').split(/\r?\n/u).map((text) => ({ text: text.trimEnd() }));
}

/**
 * Index of the line that should be highlighted at `positionMs`, with the whole lyric shifted
 * by `shiftMs` (positive = lyrics appear later). -1 before the first line.
 */
export function activeIndex(rows: readonly LyricsRow[], positionMs: number, shiftMs = 0): number {
  let idx = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const start = rows[i]?.startMs;
    if (start === undefined) return -1;
    if (start + shiftMs <= positionMs) idx = i;
    else break;
  }
  return idx;
}

/** 0..1 progress through the active line, for the karaoke-style fill. */
export function lineProgress(row: LyricsRow | undefined, positionMs: number, shiftMs = 0): number {
  if (row?.startMs === undefined || row.endMs === undefined) return 0;
  const start = row.startMs + shiftMs;
  const end = row.endMs + shiftMs;
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (positionMs - start) / (end - start)));
}

const encoder = new TextEncoder();

/** Group consecutive lines into chunks whose UTF-8 size (joined by \n) stays under `maxBytes`. */
export function chunkLines(
  lines: readonly string[],
  maxBytes: number,
): { start: number; lines: string[] }[] {
  const chunks: { start: number; lines: string[] }[] = [];
  let cur: string[] = [];
  let curStart = 0;
  let curBytes = 0;
  lines.forEach((line, i) => {
    const bytes = encoder.encode(line).length + 1;
    if (cur.length && curBytes + bytes > maxBytes) {
      chunks.push({ start: curStart, lines: cur });
      cur = [];
      curBytes = 0;
      curStart = i;
    }
    if (!cur.length) curStart = i;
    cur.push(line);
    curBytes += bytes;
  });
  if (cur.length) chunks.push({ start: curStart, lines: cur });
  return chunks;
}

/** Cheap stable hash so cached translations are tied to the exact lines they were made from. */
export function hashLines(lines: readonly string[]): string {
  let h = 5381;
  for (const line of lines) {
    for (let i = 0; i < line.length; i += 1) h = ((h << 5) + h + line.charCodeAt(i)) | 0;
    h = ((h << 5) + h + 10) | 0;
  }
  return `${String(lines.length)}-${(h >>> 0).toString(36)}`;
}
