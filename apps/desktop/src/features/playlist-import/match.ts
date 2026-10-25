import type { ImportEntry } from './parse';

/** Text for comparing titles and names: no case, accents, brackets, "feat." tails or punctuation. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[([{][^)\]}]*[)\]}]/gu, ' ')
    .replace(/\s[-–—]\s.*(remaster|version|edit|mix|live|mono|stereo).*$/u, ' ')
    .replace(/\b(feat|ft|featuring)\b.*$/u, ' ')
    .replace(/&/gu, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

const tokens = (s: string): string[] => s.split(' ').filter(Boolean);

/** How much of the shorter name's words the longer one has, 0..1. */
function overlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  if (ta.length === 0 || tb.size === 0) return 0;
  const small = ta.length <= tb.size ? ta : [...tb];
  const large = ta.length <= tb.size ? tb : new Set(ta);
  return small.filter((w) => large.has(w)).length / small.length;
}

export interface Candidate {
  videoId: string;
  title: string;
  artists: string[];
  durationSeconds: number | null;
}

/** 0..1: how likely `candidate` is the song the file means. */
export function scoreCandidate(entry: ImportEntry, candidate: Candidate): number {
  const wantTitle = normalize(entry.title);
  const gotTitle = normalize(candidate.title);
  if (!wantTitle || !gotTitle) return 0;
  const title =
    wantTitle === gotTitle
      ? 1
      : gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle)
        ? 0.85
        : overlap(wantTitle, gotTitle) * 0.8;
  const wantArtist = normalize(entry.artist.split(/\s*[,;&]\s*/u)[0] ?? '');
  let artist = 0.6; // no artist in the file: neither for nor against
  if (wantArtist) {
    const got = candidate.artists.map(normalize);
    artist = got.some((g) => g === wantArtist)
      ? 1
      : got.some((g) => g.includes(wantArtist) || wantArtist.includes(g))
        ? 0.8
        : Math.max(0, ...got.map((g) => overlap(wantArtist, g))) * 0.5;
  }
  let duration = 0;
  if (entry.durationSeconds && candidate.durationSeconds) {
    const off = Math.abs(entry.durationSeconds - candidate.durationSeconds);
    duration = off <= 3 ? 0.05 : off > 20 ? -0.1 : 0;
  }
  return Math.min(1, Math.max(0, title * 0.65 + artist * 0.3 + duration));
}

export const MATCH_THRESHOLD = 0.62;

/** The best candidate, if any is a likely match. */
export function bestMatch(
  entry: ImportEntry,
  candidates: readonly Candidate[],
): { candidate: Candidate; score: number } | null {
  let best: { candidate: Candidate; score: number } | null = null;
  for (const candidate of candidates) {
    const score = scoreCandidate(entry, candidate);
    if (score > (best?.score ?? 0)) best = { candidate, score };
  }
  return best && best.score >= MATCH_THRESHOLD ? best : null;
}
