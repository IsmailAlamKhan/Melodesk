/** What the main window tells the floating lyrics window, and how that window asks for it. */
export const LINE_EVENT = 'lyrics-overlay:line';
export const REQUEST_EVENT = 'lyrics-overlay:request';
export const CLOSED_EVENT = 'lyrics-overlay:closed';

export interface OverlayLine {
  title: string;
  artist: string;
  /** The line being sung (empty during a break or when the song has no lyrics). */
  line: string;
  /** The line after it, if any. */
  next: string;
  /** Whether the lyrics are timed; untimed lyrics cannot follow the music. */
  timed: boolean;
  hasLyrics: boolean;
}

export const EMPTY_LINE: OverlayLine = {
  title: '',
  artist: '',
  line: '',
  next: '',
  timed: false,
  hasLyrics: false,
};

/** The two lines to show for a position in timed lyrics: the one being sung and the one after. */
export function linesAt(texts: readonly string[], active: number): { line: string; next: string } {
  if (active < 0) return { line: '', next: texts.find((t) => t.trim() !== '') ?? '' };
  const line = texts[active] ?? '';
  const next = texts.slice(active + 1).find((t) => t.trim() !== '') ?? '';
  return { line, next };
}

export const sameLine = (a: OverlayLine, b: OverlayLine): boolean =>
  a.title === b.title &&
  a.artist === b.artist &&
  a.line === b.line &&
  a.next === b.next &&
  a.timed === b.timed &&
  a.hasLyrics === b.hasLyrics;
