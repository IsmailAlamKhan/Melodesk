import { describe, expect, it } from 'vitest';
import { STALE_TRACK_GRACE_MS, isStaleTrack } from '../src/inject/staleTrack';

const track = (videoId: string | null, title: string, artist = 'Artist') => ({
  videoId,
  title,
  artist,
  album: null,
  artworkUrl: null,
});

describe('isStaleTrack', () => {
  const old = track('aaa', 'Old Song');

  it('holds a new id that still carries the last song’s details', () => {
    expect(isStaleTrack(old, track('bbb', 'Old Song'), 1000, 1500)).toBe(true);
  });

  it('lets the new details through', () => {
    expect(isStaleTrack(old, track('bbb', 'New Song'), 1000, 1500)).toBe(false);
    expect(isStaleTrack(old, track('bbb', 'Old Song', 'Someone Else'), 1000, 1500)).toBe(false);
  });

  it('believes identical details after the grace period (a repeat or re-upload)', () => {
    expect(isStaleTrack(old, track('bbb', 'Old Song'), 1000, 1000 + STALE_TRACK_GRACE_MS)).toBe(
      false,
    );
  });

  it('never holds the first song, the same song, or no song', () => {
    expect(isStaleTrack(null, track('bbb', 'Old Song'), 0, 0)).toBe(false);
    expect(isStaleTrack(old, track('aaa', 'Old Song'), 0, 0)).toBe(false);
    expect(isStaleTrack(old, null, 0, 0)).toBe(false);
    expect(isStaleTrack(old, track(null, 'Old Song'), 0, 0)).toBe(false);
  });
});
