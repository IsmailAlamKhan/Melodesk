/**
 * Defensive navigation through InnerTube JSON. Every accessor returns `undefined` rather than
 * throwing, because YouTube changes shapes without notice and a missing field must degrade to
 * "unknown", not crash a page.
 */
export type Json = unknown;
export type JsonObject = Record<string, unknown>;

export function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function nav(root: unknown, path: readonly (string | number)[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (typeof key === 'number') {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[key];
    } else {
      if (!isObject(cur)) return undefined;
      cur = cur[key];
    }
    if (cur === undefined || cur === null) return undefined;
  }
  return cur;
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

export function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function obj(v: unknown): JsonObject | undefined {
  return isObject(v) ? v : undefined;
}

/** The single key of a renderer wrapper like `{ musicShelfRenderer: {...} }`. */
export function rendererKey(v: unknown): string | undefined {
  if (!isObject(v)) return undefined;
  const keys = Object.keys(v);
  return keys.length === 1 ? keys[0] : keys.find((k) => k.endsWith('Renderer'));
}

// ---------------------------------------------------------------------------
// Text runs
// ---------------------------------------------------------------------------

export interface Run {
  text: string;
  endpoint?: JsonObject | undefined;
  bold?: boolean | undefined;
}

export function runs(v: unknown): Run[] {
  const list = arr(nav(v, ['runs']));
  const out: Run[] = [];
  for (const r of list) {
    const text = str(nav(r, ['text']));
    if (text === undefined) continue;
    out.push({ text, endpoint: obj(nav(r, ['navigationEndpoint'])), bold: bool(nav(r, ['bold'])) });
  }
  return out;
}

/** Joined text of `{runs:[...]}` or `{simpleText:...}`. */
export function text(v: unknown): string | undefined {
  const simple = str(nav(v, ['simpleText']));
  if (simple !== undefined) return simple;
  const r = runs(v);
  return r.length ? r.map((x) => x.text).join('') : undefined;
}

/** Split runs into groups separated by " • " (YouTube's subtitle separator). */
export function splitRuns(list: Run[]): Run[][] {
  const groups: Run[][] = [[]];
  for (const r of list) {
    if (/^\s*[•·]\s*$/u.test(r.text)) groups.push([]);
    else groups[groups.length - 1]?.push(r);
  }
  return groups.filter((g) => g.length > 0);
}

// ---------------------------------------------------------------------------
// Thumbnails
// ---------------------------------------------------------------------------

export interface Thumb {
  url: string;
  width: number;
  height: number;
}

export function thumbnails(v: unknown): Thumb[] {
  const candidates = [
    nav(v, ['musicThumbnailRenderer', 'thumbnail', 'thumbnails']),
    nav(v, ['thumbnail', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails']),
    nav(v, ['thumbnail', 'thumbnails']),
    nav(v, ['thumbnails']),
    nav(v, ['croppedSquareThumbnailRenderer', 'thumbnail', 'thumbnails']),
  ];
  for (const c of candidates) {
    const list = arr(c);
    if (!list.length) continue;
    const out: Thumb[] = [];
    for (const t of list) {
      const url = str(nav(t, ['url']));
      if (!url?.startsWith('https://')) continue;
      out.push({ url, width: num(nav(t, ['width'])) ?? 0, height: num(nav(t, ['height'])) ?? 0 });
    }
    if (out.length) return out;
  }
  return [];
}

/** Pick the smallest thumbnail at least `min` px wide, else the largest available. */
export function pickThumb(list: readonly Thumb[], min: number): string | null {
  const sorted = [...list].sort((a, b) => a.width - b.width);
  return (sorted.find((t) => t.width >= min) ?? sorted[sorted.length - 1])?.url ?? null;
}

/** Durations like "3:34" or "1:02:03" → seconds. */
export function parseDuration(s: string | undefined): number | null {
  if (!s) return null;
  const parts = s
    .trim()
    .split(':')
    .map((p) => Number.parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}
