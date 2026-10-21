import { describe, expect, it } from 'vitest';
import {
  estimateSungMs,
  interlude,
  lineEndMs,
  splitWords,
  wordFills,
  wordTimings,
} from './karaoke';

describe('splitWords', () => {
  it('splits on spaces and per character for CJK', () => {
    expect(splitWords('  hello   big world ')).toEqual(['hello', 'big', 'world']);
    expect(splitWords('夜に駆ける')).toEqual(['夜', 'に', '駆', 'け', 'る']);
    expect(splitWords('   ')).toEqual([]);
  });
});

describe('wordTimings', () => {
  const row = { text: 'aa bbbb', startMs: 1000, endMs: 4000 };
  it('spreads the line over its words by length and covers it exactly', () => {
    const w = wordTimings(row);
    expect(w).toHaveLength(2);
    expect(w[0]?.startMs).toBe(1000);
    expect(w[1]?.endMs).toBe(4000);
    expect(w[0]?.endMs).toBe(w[1]?.startMs);
    // weights 3 and 5 of 8
    expect(w[0]?.endMs).toBeCloseTo(1000 + (3000 * 3) / 8);
  });
  it('never runs past the next line', () => {
    expect(lineEndMs(row, 3000)).toBeLessThanOrEqual(3000);
    expect(wordTimings(row, 3000).at(-1)?.endMs).toBeLessThanOrEqual(3000);
  });
  it('has nothing for untimed or empty lines', () => {
    expect(wordTimings({ text: 'plain' })).toEqual([]);
    expect(wordTimings({ text: ' ', startMs: 0, endMs: 1 })).toEqual([]);
  });
});

describe('lineEndMs', () => {
  it('honours a real end time', () => {
    expect(lineEndMs({ text: 'Ohhh', startMs: 1000, endMs: 9000 }, 12_000)).toBe(9000);
  });
  it('estimates the sung length when the end is just the next start (LRC)', () => {
    const row = { text: 'hello world', startMs: 1000, endMs: 20_000 };
    expect(lineEndMs(row, 20_000)).toBe(1000 + estimateSungMs('hello world'));
    expect(lineEndMs(row, 2000)).toBe(2000); // never past the next line
  });
  it('keeps estimates within sensible bounds', () => {
    expect(estimateSungMs('a')).toBe(1500);
    expect(estimateSungMs('x'.repeat(500))).toBe(10_000);
  });
});

describe('wordFills', () => {
  it('fills words in order, shifted by the offset', () => {
    const w = wordTimings({ text: 'aa bbbb', startMs: 1000, endMs: 4000 });
    expect(wordFills(w, 500)).toEqual([0, 0]);
    expect(wordFills(w, 4500)).toEqual([1, 1]);
    const mid = wordFills(w, 2125);
    expect(mid[0]).toBe(1);
    expect(mid[1]).toBe(0);
    expect(wordFills(w, 1000, 500)).toEqual([0, 0]); // lyrics later by 0.5 s
  });
});

describe('interlude with LRC-style timing', () => {
  // every line "ends" where the next begins, as in an .lrc file
  const lrc = [
    { text: 'Hello from the other side', startMs: 10_000, endMs: 14_000 },
    { text: 'I must have called a thousand times', startMs: 14_000, endMs: 30_000 },
    { text: 'To tell you I am sorry', startMs: 30_000, endMs: 34_000 },
  ];
  it('finds the break after a line that is sung faster than the gap', () => {
    const i = interlude(lrc, 22_000);
    expect(i?.nextIndex).toBe(2);
    expect(i?.remainingMs).toBe(8000);
  });
  it('does not call a continuous passage a break', () => {
    expect(interlude(lrc, 11_000)).toBeNull();
    expect(interlude(lrc, 15_000)).toBeNull();
  });
});

describe('interlude', () => {
  const rows = [
    { text: 'one', startMs: 10_000, endMs: 13_000 },
    { text: 'two', startMs: 14_000, endMs: 17_000 },
    { text: '', startMs: 17_000, endMs: 30_000 },
    { text: 'three', startMs: 30_000, endMs: 33_000 },
  ];
  it('counts down the intro before the first line', () => {
    const i = interlude(rows, 4000);
    expect(i?.nextIndex).toBe(0);
    expect(i?.remainingMs).toBe(6000);
    expect(i?.progress).toBeCloseTo(0.4);
  });
  it('is quiet while singing and for short pauses', () => {
    expect(interlude(rows, 11_000)).toBeNull();
    expect(interlude(rows, 13_500)).toBeNull(); // 1 s pause
  });
  it('detects a long break between lines, even with a blank filler row', () => {
    const i = interlude(rows, 20_000);
    expect(i?.nextIndex).toBe(3);
    expect(i?.remainingMs).toBe(10_000);
  });
  it('follows the offset and ignores untimed lyrics', () => {
    expect(interlude(rows, 4000, -2000)?.remainingMs).toBe(4000);
    expect(interlude([{ text: 'plain' }], 0)).toBeNull();
    expect(interlude(rows, 99_000)).toBeNull();
  });
});
