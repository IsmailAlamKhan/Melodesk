/**
 * Pseudo-localization for development: exercises layouts and finds untranslated strings
 * without needing real translations.
 *
 * - en-XA: accented and padded (~35% longer) so overflow shows up, e.g. "Play" → "[Ƥĺàý ~~~]"
 * - ar-XB: right-to-left test locale; text is wrapped in bidi override marks so it renders
 *   mirrored, and the UI switches to dir="rtl"
 *
 * `{placeholders}` are left alone.
 */
const MAP: Record<string, string> = {
  a: 'à',
  b: 'ƀ',
  c: 'ç',
  d: 'ð',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'î',
  j: 'ĵ',
  k: 'ķ',
  l: 'ĺ',
  m: 'ɱ',
  n: 'ñ',
  o: 'ö',
  p: 'þ',
  q: 'ǫ',
  r: 'ŕ',
  s: 'š',
  t: 'ţ',
  u: 'û',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
  A: 'À',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Ð',
  E: 'É',
  F: 'Ƒ',
  G: 'Ĝ',
  H: 'Ĥ',
  I: 'Î',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ĺ',
  M: 'Ṁ',
  N: 'Ñ',
  O: 'Ö',
  P: 'Ƥ',
  Q: 'Ǫ',
  R: 'Ŕ',
  S: 'Š',
  T: 'Ţ',
  U: 'Û',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ý',
  Z: 'Ž',
};

/** Apply `fn` to the text outside `{placeholders}`. */
function outsidePlaceholders(s: string, fn: (text: string) => string): string {
  return s
    .split(/(\{[^}]*\})/u)
    .map((part) => (part.startsWith('{') && part.endsWith('}') ? part : fn(part)))
    .join('');
}

export function pseudoAccent(s: string): string {
  const body = outsidePlaceholders(s, (t) => Array.from(t, (c) => MAP[c] ?? c).join(''));
  const pad = '~'.repeat(Math.ceil(s.length * 0.35));
  return `[${body}${pad ? ` ${pad}` : ''}]`;
}

export function pseudoRtl(s: string): string {
  // U+202E RIGHT-TO-LEFT OVERRIDE … U+202C POP DIRECTIONAL FORMATTING
  return outsidePlaceholders(s, (t) => (t.trim() ? `‮${t}‬` : t));
}

export const PSEUDO_LOCALES = ['en-XA', 'ar-XB'] as const;
export type PseudoLocale = (typeof PSEUDO_LOCALES)[number];

export function isPseudo(locale: string): locale is PseudoLocale {
  return (PSEUDO_LOCALES as readonly string[]).includes(locale);
}

export function pseudoize(locale: PseudoLocale, s: string): string {
  return locale === 'en-XA' ? pseudoAccent(s) : pseudoRtl(s);
}
