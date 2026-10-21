import { describe, expect, it } from 'vitest';
import { worthResuming } from './saved';

describe('worthResuming', () => {
  it('skips the first seconds and the last seconds of a song', () => {
    expect(worthResuming(4, 200)).toBe(false);
    expect(worthResuming(60, 200)).toBe(true);
    expect(worthResuming(195, 200)).toBe(false);
  });
  it('works without a known length', () => {
    expect(worthResuming(30, 0)).toBe(true);
    expect(worthResuming(3, 0)).toBe(false);
  });
});
