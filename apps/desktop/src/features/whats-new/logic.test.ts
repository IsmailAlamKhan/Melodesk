import { describe, expect, it } from 'vitest';
import { compareVersions, parseVersion, releasesSince, releasesUpTo } from './logic';
import { RELEASES, type Release } from './releases';
import en from '../../i18n/locales/en.json';

const list: Release[] = [
  { version: '0.3.0', highlights: [] },
  { version: '0.5.0', highlights: [] },
  { version: '0.4.0', highlights: [] },
  { version: '0.10.0', highlights: [] },
];

describe('versions', () => {
  it('reads plain and prefixed versions, and nothing else', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('v0.7.0-beta.1')).toEqual([0, 7, 0]);
    expect(parseVersion('latest')).toBeNull();
  });
  it('compares numbers, not text', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('0.3.0', '0.3.0')).toBe(0);
    expect(compareVersions('0.2.9', '0.3.0')).toBeLessThan(0);
    expect(compareVersions('x', '0.3.0')).toBe(0);
  });
});

describe('releasesSince', () => {
  it('lists what came after the last seen version, up to the one running, newest first', () => {
    expect(releasesSince(list, '0.3.0', '0.5.0').map((r) => r.version)).toEqual(['0.5.0', '0.4.0']);
  });
  it('leaves out versions newer than the one running, and has nothing when up to date', () => {
    expect(releasesSince(list, '0.3.0', '0.4.0').map((r) => r.version)).toEqual(['0.4.0']);
    expect(releasesSince(list, '0.5.0', '0.5.0')).toEqual([]);
  });
  it('lists everything up to the running version by hand', () => {
    expect(releasesUpTo(list, '0.5.0').map((r) => r.version)).toEqual(['0.5.0', '0.4.0', '0.3.0']);
  });
});

describe('the release list', () => {
  it('is newest first, with a message for every highlight', () => {
    const versions = RELEASES.map((r) => r.version);
    expect([...versions].sort((a, b) => compareVersions(b, a))).toEqual(versions);
    for (const r of RELEASES) {
      expect(r.highlights.length).toBeGreaterThan(0);
      for (const key of r.highlights) expect((en as Record<string, string>)[key], key).toBeTruthy();
    }
  });
});
