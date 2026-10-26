import { describe, expect, it } from 'vitest';
import { EMPTY_LINE, linesAt, sameLine } from './protocol';

describe('linesAt', () => {
  const texts = ['one', '', 'two', 'three'];
  it('gives the line being sung and the next one that has words', () => {
    expect(linesAt(texts, 0)).toEqual({ line: 'one', next: 'two' });
    expect(linesAt(texts, 2)).toEqual({ line: 'two', next: 'three' });
  });
  it('has no next line at the end', () => {
    expect(linesAt(texts, 3)).toEqual({ line: 'three', next: '' });
  });
  it('before the first line shows what is coming', () => {
    expect(linesAt(texts, -1)).toEqual({ line: '', next: 'one' });
    expect(linesAt([], -1)).toEqual({ line: '', next: '' });
  });
});

describe('sameLine', () => {
  it('tells when nothing changed', () => {
    expect(sameLine(EMPTY_LINE, { ...EMPTY_LINE })).toBe(true);
    expect(sameLine(EMPTY_LINE, { ...EMPTY_LINE, line: 'x' })).toBe(false);
  });
});
