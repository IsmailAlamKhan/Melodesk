/**
 * Offline romanization of lyrics. Nothing is sent anywhere. Indic scripts, Cyrillic, Greek,
 * kana and most others use any-ascii's per-character tables (loaded lazily, ~500 kB); Hangul
 * uses Revised Romanization implemented here, because the table output is unreadable.
 *
 * Known limits: Chinese characters (and Japanese kanji) are read as Mandarin, and abjads such
 * as Arabic and Hebrew come out without vowels. `transliterationCaveat` flags both.
 */

/** Runs of letters/marks that are not Latin script. */
const NON_LATIN_RUN = /(?:(?!\p{Script=Latin})[\p{L}\p{M}])+/gu;
const HANGUL_RUN = /[가-힣]+/gu;

export function needsTransliteration(text: string): boolean {
  NON_LATIN_RUN.lastIndex = 0;
  return NON_LATIN_RUN.test(text);
}

export type Caveat = 'kanji' | 'abjad' | null;

export function transliterationCaveat(lines: readonly string[]): Caveat {
  const all = lines.join('\n');
  if (/\p{Script=Han}/u.test(all)) return 'kanji';
  if (/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(all)) return 'abjad';
  return null;
}

// --- Hangul (Revised Romanization, with liaison) -----------------------------------------

const INITIAL = [
  'g',
  'kk',
  'n',
  'd',
  'tt',
  'r',
  'm',
  'b',
  'pp',
  's',
  'ss',
  '',
  'j',
  'jj',
  'ch',
  'k',
  't',
  'p',
  'h',
];
const VOWEL = [
  'a',
  'ae',
  'ya',
  'yae',
  'eo',
  'e',
  'yeo',
  'ye',
  'o',
  'wa',
  'wae',
  'oe',
  'yo',
  'u',
  'wo',
  'we',
  'wi',
  'yu',
  'eu',
  'ui',
  'i',
];
/** Final consonant as pronounced at the end of a syllable. */
const FINAL = [
  '',
  'k',
  'k',
  'k',
  'n',
  'n',
  'n',
  't',
  'l',
  'k',
  'm',
  'p',
  'l',
  'l',
  'p',
  'l',
  'm',
  'p',
  'p',
  't',
  't',
  'ng',
  't',
  't',
  'k',
  't',
  'p',
  't',
];
/** When a final is followed by silent ㅇ it moves to the next syllable: [stays, moves]. */
const LIAISON: [string, string][] = [
  ['', ''],
  ['', 'g'],
  ['', 'kk'],
  ['k', 's'],
  ['', 'n'],
  ['n', 'j'],
  ['n', 'h'],
  ['', 'd'],
  ['', 'r'],
  ['l', 'g'],
  ['l', 'm'],
  ['l', 'b'],
  ['l', 's'],
  ['l', 't'],
  ['l', 'p'],
  ['l', 'h'],
  ['', 'm'],
  ['', 'b'],
  ['p', 's'],
  ['', 's'],
  ['', 'ss'],
  ['ng', ''],
  ['', 'j'],
  ['', 'ch'],
  ['', 'k'],
  ['', 't'],
  ['', 'p'],
  ['', ''],
];

export function romanizeHangul(text: string): string {
  const syllables = Array.from(text, (ch) => {
    const code = ch.charCodeAt(0) - 0xac00;
    return { i: Math.floor(code / 588), v: Math.floor((code % 588) / 28), f: code % 28 };
  });
  let out = '';
  syllables.forEach((s, k) => {
    const next = syllables[k + 1];
    let initial = INITIAL[s.i] ?? '';
    if (k > 0) {
      // Initial ㅇ after a consonant that moved over (liaison) is handled when the previous syllable ran.
      const prev = syllables[k - 1];
      if (prev && s.i === 11 && prev.f !== 0 && prev.f !== 21) initial = LIAISON[prev.f]?.[1] ?? '';
    }
    out += initial + (VOWEL[s.v] ?? '');
    if (s.f === 0) return;
    if (next?.i === 11 && s.f !== 21) out += LIAISON[s.f]?.[0] ?? '';
    else out += FINAL[s.f] ?? '';
  });
  return out;
}

// --- Entry point -------------------------------------------------------------------------

type AnyAscii = (s: string) => string;
let anyAsciiPromise: Promise<AnyAscii> | null = null;

function loadAnyAscii(): Promise<AnyAscii> {
  anyAsciiPromise ??= import('any-ascii').then((m) => m.default);
  return anyAsciiPromise;
}

/** Romanize every non-Latin run in each line; Latin text, digits and punctuation are untouched. */
export async function transliterateLines(lines: readonly string[]): Promise<string[]> {
  if (!lines.some(needsTransliteration)) return [...lines];
  const anyAscii = await loadAnyAscii();
  return lines.map((line) =>
    line
      .replace(HANGUL_RUN, (run) => romanizeHangul(run))
      .replace(NON_LATIN_RUN, (run) => anyAscii(run)),
  );
}
