import { describe, expect, it } from 'vitest';
import { parseMediaSessionArtist } from '../src';

describe('parseMediaSessionArtist (v1)', () => {
  it('splits artist, album and year', () => {
    expect(parseMediaSessionArtist('Daft Punk • Discovery • 2001')).toEqual({
      artist: 'Daft Punk',
      album: 'Discovery',
      year: 2001,
    });
  });
  it('handles artist only', () => {
    expect(parseMediaSessionArtist('Daft Punk')).toEqual({
      artist: 'Daft Punk',
      album: null,
      year: null,
    });
  });
  it('handles artist and year without album', () => {
    expect(parseMediaSessionArtist('Daft Punk • 2001')).toEqual({
      artist: 'Daft Punk',
      album: null,
      year: 2001,
    });
  });
  it('is safe on empty input', () => {
    expect(parseMediaSessionArtist('')).toEqual({ artist: '', album: null, year: null });
  });
});
