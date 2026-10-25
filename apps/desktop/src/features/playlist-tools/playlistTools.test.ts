import { describe, expect, it } from 'vitest';
import { toM3u8 } from './playlistTools';

const song = (title: string, artists: string[], seconds: number | null, videoId: string) =>
  ({
    kind: 'song',
    key: videoId,
    title,
    artists: artists.map((name) => ({ name, endpoint: null })),
    album: null,
    durationSeconds: seconds,
    videoId,
  }) as never;

describe('toM3u8', () => {
  it('writes each song as an EXTINF line and its YouTube Music link', () => {
    const text = toM3u8('My mix', [
      song('Get Lucky', ['Daft Punk', 'Pharrell'], 369.4, 'abcdefghijk'),
      song('Solo', [], null, 'bcdefghijkl'),
    ]);
    expect(text.split('\n')).toEqual([
      '#EXTM3U',
      '#PLAYLIST:My mix',
      '#EXTINF:369,Daft Punk, Pharrell - Get Lucky',
      'https://music.youtube.com/watch?v=abcdefghijk',
      '#EXTINF:-1,Solo',
      'https://music.youtube.com/watch?v=bcdefghijkl',
      '',
    ]);
  });
});
