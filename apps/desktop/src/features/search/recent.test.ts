import { describe, expect, it } from 'vitest';
import { MAX_RECENT, pushRecent } from './recent';

describe('pushRecent', () => {
  it('puts the newest first and does not repeat a search, whatever its case or spacing', () => {
    expect(pushRecent(['b', 'a'], 'c')).toEqual(['c', 'b', 'a']);
    expect(pushRecent(['b', 'Daft Punk', 'a'], '  daft   punk ')).toEqual(['daft punk', 'b', 'a']);
  });
  it('keeps only the most recent few', () => {
    const many = Array.from({ length: 20 }, (_, i) => `q${String(i)}`);
    expect(pushRecent(many, 'new')).toHaveLength(MAX_RECENT);
    expect(pushRecent(many, 'new')[0]).toBe('new');
  });
  it('ignores an empty search', () => {
    expect(pushRecent(['a'], '   ')).toEqual(['a']);
  });
});
