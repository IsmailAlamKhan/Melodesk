/**
 * Pure helpers for karaoke mode. LRCLIB gives timing per line only, so words are timed by
 * spreading each line's duration over its words in proportion to their length: it looks right
 * and is honest about being an estimate.
 */
import type { LyricsRow } from '../lyrics/rows';

export interface WordTiming {
  text: string;
  startMs: number;
  endMs: number;
}

const CJK = /[぀-ヿ㐀-鿿가-힯]/u;
const MS_PER_CHAR = 110;
/** A pause shorter than this is just breathing room, not an instrumental break. */
export const INTERLUDE_MIN_MS = 5000;

/** Words of a line: split on spaces, or per character for scripts written without spaces. */
export function splitWords(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const spaced = trimmed.split(/\s+/u);
  if (spaced.length === 1 && CJK.test(trimmed)) return Array.from(trimmed);
  return spaced;
}

/** About how long a line takes to sing, from its length. Only used when no real end time is known. */
export function estimateSungMs(text: string): number {
  return Math.min(10_000, Math.max(1500, Array.from(text.trim()).length * MS_PER_CHAR + 500));
}

/**
 * When the line really ends. LRC files only carry start times, so a line's "end" is just the next
 * line's start; that hides pauses and would stretch the word fill across them. In that case we
 * estimate the sung length instead. A genuine end time (YouTube's own timed lyrics) is honoured.
 */
export function lineEndMs(row: LyricsRow, nextStartMs: number | undefined): number {
  const start = row.startMs ?? 0;
  const hasNext = nextStartMs !== undefined && nextStartMs > start;
  const synthesized = row.endMs === undefined || (hasNext && row.endMs >= nextStartMs);
  const own = row.endMs ?? start + estimateSungMs(row.text);
  const bounded = hasNext ? Math.min(own, nextStartMs) : own;
  return synthesized ? Math.min(bounded, start + estimateSungMs(row.text)) : bounded;
}

/** Spread the line's duration over its words by length (+1 so short words still take time). */
export function wordTimings(row: LyricsRow, nextStartMs?: number): WordTiming[] {
  if (row.startMs === undefined) return [];
  const words = splitWords(row.text);
  if (words.length === 0) return [];
  const start = row.startMs;
  const span = Math.max(1, lineEndMs(row, nextStartMs) - start);
  const weights = words.map((w) => Array.from(w).length + 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  return words.map((text, i) => {
    const from = start + (span * acc) / total;
    acc += weights[i] ?? 1;
    return { text, startMs: from, endMs: start + (span * acc) / total };
  });
}

/** 0..1 fill for each word at `positionMs` (lyrics shifted by `shiftMs`). */
export function wordFills(words: readonly WordTiming[], positionMs: number, shiftMs = 0): number[] {
  return words.map((w) => {
    const from = w.startMs + shiftMs;
    const to = w.endMs + shiftMs;
    if (to <= from) return positionMs >= from ? 1 : 0;
    return Math.min(1, Math.max(0, (positionMs - from) / (to - from)));
  });
}

export interface Interlude {
  remainingMs: number;
  /** 0..1 through the break. */
  progress: number;
  /** Index of the line that comes next. */
  nextIndex: number;
}

/**
 * An instrumental break: the singing has stopped and the next line is still a while away.
 * Includes the intro before the first line. Null while a line is being sung.
 */
export function interlude(
  rows: readonly LyricsRow[],
  positionMs: number,
  shiftMs = 0,
  minGapMs = INTERLUDE_MIN_MS,
): Interlude | null {
  let next = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (r?.startMs === undefined) return null;
    if (r.text.trim() && r.startMs + shiftMs > positionMs) {
      next = i;
      break;
    }
  }
  if (next < 0) return null;
  const nextRow = rows[next];
  if (nextRow?.startMs === undefined) return null;
  const nextStart = nextRow.startMs + shiftMs;
  let prevEnd = 0;
  for (let i = next - 1; i >= 0; i -= 1) {
    const r = rows[i];
    if (r?.startMs !== undefined && r.text.trim()) {
      prevEnd = lineEndMs(r, nextRow.startMs) + shiftMs;
      break;
    }
  }
  const gap = nextStart - prevEnd;
  if (gap < minGapMs || positionMs < prevEnd) return null;
  return {
    remainingMs: nextStart - positionMs,
    progress: Math.min(1, Math.max(0, (positionMs - prevEnd) / gap)),
    nextIndex: next,
  };
}
