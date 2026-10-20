import { describe, expect, it } from 'vitest';
import { toPlayerPath } from './links';

describe('toPlayerPath', () => {
  it('passes music.youtube.com paths through', () => {
    expect(toPlayerPath('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD')).toBe(
      '/watch?v=dQw4w9WgXcQ&list=RD',
    );
    expect(toPlayerPath('https://music.youtube.com/playlist?list=PL123')).toBe(
      '/playlist?list=PL123',
    );
  });
  it('maps youtube.com and youtu.be watch links', () => {
    expect(toPlayerPath('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      '/watch?v=dQw4w9WgXcQ',
    );
    expect(toPlayerPath('https://youtu.be/dQw4w9WgXcQ')).toBe('/watch?v=dQw4w9WgXcQ');
  });
  it('rejects other hosts, schemes and junk', () => {
    expect(toPlayerPath('https://evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(toPlayerPath('http://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(toPlayerPath('not a url')).toBeNull();
    expect(toPlayerPath('https://youtu.be/../x')).toBeNull();
  });
});
