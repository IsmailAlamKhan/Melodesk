import { describe, expect, it } from 'vitest';
import { activeIndex, chunkLines, hashLines, lineProgress, rowsFromLyrics } from './rows';
import {
  needsTransliteration,
  romanizeHangul,
  transliterateLines,
  transliterationCaveat,
} from './transliterate';
import { translateLines, TranslateError, type Fetcher, type TranslateConfig } from './translate';

const rows = [
  { text: 'a', startMs: 1000, endMs: 3000 },
  { text: 'b', startMs: 3000, endMs: 5000 },
  { text: 'c', startMs: 5000, endMs: 9000 },
];

describe('sync', () => {
  it('finds the active line, with a shift', () => {
    expect(activeIndex(rows, 500)).toBe(-1);
    expect(activeIndex(rows, 1000)).toBe(0);
    expect(activeIndex(rows, 3500)).toBe(1);
    expect(activeIndex(rows, 3500, 1000)).toBe(0); // lyrics shifted later by 1s
    expect(activeIndex(rows, 4500, -1000)).toBe(2); // lyrics shifted earlier by 1s
    expect(activeIndex([{ text: 'plain' }], 3500)).toBe(-1);
  });
  it('reports progress through the active line', () => {
    expect(lineProgress(rows[2], 7000)).toBe(0.5);
    expect(lineProgress(rows[2], 100)).toBe(0);
    expect(lineProgress(rows[2], 99_000)).toBe(1);
    expect(lineProgress({ text: 'x' }, 1)).toBe(0);
  });
  it('builds rows from plain and timed lyrics', () => {
    expect(rowsFromLyrics({ text: 'one\n\ntwo', synced: null }).map((r) => r.text)).toEqual([
      'one',
      '',
      'two',
    ]);
    expect(
      rowsFromLyrics({ text: null, synced: [{ startMs: 1, endMs: 2, text: 'x' }] })[0],
    ).toEqual({ text: 'x', startMs: 1, endMs: 2 });
  });
});

describe('chunking and hashing', () => {
  it('keeps chunks under the byte budget and preserves order', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line number ${String(i)} with some words`);
    const chunks = chunkLines(lines, 100);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.flatMap((c) => c.lines)).toEqual(lines);
    for (const c of chunks)
      expect(new TextEncoder().encode(c.lines.join('\n')).length).toBeLessThanOrEqual(100);
    expect(chunks[1]?.start).toBe(chunks[0]?.lines.length);
  });
  it('hashes content, not identity', () => {
    expect(hashLines(['a', 'b'])).toBe(hashLines(['a', 'b']));
    expect(hashLines(['a', 'b'])).not.toBe(hashLines(['a', 'c']));
  });
});

describe('transliteration', () => {
  it('detects non-Latin text only', () => {
    expect(needsTransliteration('hello café')).toBe(false);
    expect(needsTransliteration('আমি')).toBe(true);
    expect(needsTransliteration('hello 안녕')).toBe(true);
  });
  it('romanizes Indic scripts, Cyrillic and kana offline', async () => {
    const out = await transliterateLines([
      'আমি তোমাকে ভালোবাসি',
      'तुम ही हो, अब तुम ही हो',
      'Привет, как дела',
      'こんにちは せかい',
      'plain English stays',
    ]);
    expect(out[0]).toBe('ami tomake bhalobasi');
    expect(out[1]).toBe('tum hi ho, ab tum hi ho');
    expect(out[2]).toBe('Privet, kak dela');
    expect(out[3]).toBe('konnichiha sekai');
    expect(out[4]).toBe('plain English stays');
  });
  it('romanizes Hangul with Revised Romanization and liaison', () => {
    expect(romanizeHangul('사랑해요')).toBe('saranghaeyo');
    expect(romanizeHangul('한국어')).toBe('hangugeo');
    expect(romanizeHangul('안녕하세요')).toBe('annyeonghaseyo');
    expect(romanizeHangul('사랑')).toBe('sarang');
  });
  it('flags unreliable scripts', () => {
    expect(transliterationCaveat(['君の名は'])).toBe('kanji');
    expect(transliterationCaveat(['أحبك'])).toBe('abjad');
    expect(transliterationCaveat(['আমি'])).toBeNull();
  });
});

const cfg: TranslateConfig = {
  provider: 'mymemory',
  target: 'en',
  source: 'auto',
  libreUrl: '',
  libreKey: '',
};
const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

describe('translation', () => {
  it('translates chunked lines and keeps blank lines', async () => {
    const calls: string[] = [];
    const f: Fetcher = (url) => {
      const q = new URL(url).searchParams.get('q') ?? '';
      calls.push(q);
      return json({
        responseStatus: 200,
        responseData: {
          translatedText: q
            .split('\n')
            .map((l) => (l ? `T:${l}` : ''))
            .join('\n'),
        },
      });
    };
    const out = await translateLines(['one', '', 'two', 'three'], cfg, f);
    expect(out).toEqual(['T:one', '', 'T:two', 'T:three']);
    expect(calls).toHaveLength(1);
  });
  it('falls back to per-line requests when alignment is lost', async () => {
    const f: Fetcher = (url) => {
      const q = new URL(url).searchParams.get('q') ?? '';
      return json({
        responseStatus: 200,
        responseData: { translatedText: q.includes('\n') ? 'collapsed into one line' : `T:${q}` },
      });
    };
    expect(await translateLines(['a', 'b'], cfg, f)).toEqual(['T:a', 'T:b']);
  });
  it('leaves lines alone when already in the target language (403)', async () => {
    const f: Fetcher = () =>
      json({
        responseStatus: 403,
        responseData: { translatedText: 'PLEASE SELECT TWO DISTINCT LANGUAGES' },
      });
    expect(await translateLines(['hello'], cfg, f)).toEqual(['hello']);
  });
  it('reports quota exhaustion clearly', async () => {
    const f: Fetcher = () =>
      json({ responseStatus: 429, quotaFinished: true, responseData: { translatedText: '' } }, 429);
    await expect(translateLines(['x'], cfg, f)).rejects.toMatchObject({ kind: 'quota' });
  });
  it('only allows LibreTranslate on localhost', async () => {
    const bad: TranslateConfig = {
      ...cfg,
      provider: 'libretranslate',
      libreUrl: 'https://evil.example',
    };
    await expect(translateLines(['x'], bad, () => json({}))).rejects.toBeInstanceOf(TranslateError);
    const ok: TranslateConfig = {
      ...cfg,
      provider: 'libretranslate',
      libreUrl: 'http://localhost:5000',
    };
    const f: Fetcher = () => json({ translatedText: ['A', 'B'] });
    expect(await translateLines(['x', '', 'y'], ok, f)).toEqual(['A', '', 'B']);
  });
  it('rejects identical source and target', async () => {
    await expect(
      translateLines(['x'], { ...cfg, source: 'en' }, () => json({})),
    ).rejects.toMatchObject({ kind: 'config' });
  });
});
