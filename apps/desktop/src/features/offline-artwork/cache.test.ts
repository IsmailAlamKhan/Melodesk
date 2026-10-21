import { describe, expect, it } from 'vitest';
import { planEviction } from './cache';

const e = (url: string, size: number, at: number) => ({ url, size, at });

describe('planEviction', () => {
  it('keeps everything while under the cap', () => {
    expect(planEviction([e('a', 10, 1), e('b', 10, 2)], 20)).toEqual([]);
  });
  it('drops the least recently used first, only as many as needed', () => {
    const items = [e('new', 40, 30), e('old', 40, 10), e('mid', 40, 20)];
    expect(planEviction(items, 100)).toEqual(['old']);
    expect(planEviction(items, 50)).toEqual(['old', 'mid']);
  });
  it('can drop everything for a zero cap', () => {
    expect(planEviction([e('a', 1, 1), e('b', 1, 2)], 0)).toEqual(['a', 'b']);
  });
});
