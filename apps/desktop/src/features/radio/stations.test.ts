import { describe, expect, it } from 'vitest';
import { firstStream, isPlaylistFile, parseDirectory, stationTrack } from './stations';

describe('playlist files', () => {
  it('finds the stream in a .pls', () => {
    const pls =
      '[playlist]\nnumberofentries=2\nFile1=http://stream.example.com:8000/live\nTitle1=Radio\nFile2=http://backup.example.com/live\n';
    expect(firstStream(pls)).toBe('http://stream.example.com:8000/live');
  });
  it('finds the stream in an .m3u, skipping comments', () => {
    expect(firstStream('#EXTM3U\n#EXTINF:-1,Radio\nhttps://stream.example.com/live.mp3\n')).toBe(
      'https://stream.example.com/live.mp3',
    );
  });
  it('is null when there is no web address', () => {
    expect(firstStream('File1=/local/file.mp3\n')).toBeNull();
    expect(firstStream('')).toBeNull();
  });
  it('tells a playlist file from a stream by its name', () => {
    expect(isPlaylistFile('http://x.example.com/radio.pls')).toBe(true);
    expect(isPlaylistFile('http://x.example.com/radio.M3U?x=1')).toBe(true);
    expect(isPlaylistFile('http://x.example.com/live')).toBe(false);
    expect(isPlaylistFile('not an address')).toBe(false);
  });
});

describe('the directory', () => {
  it('reads stations, preferring the resolved stream address', () => {
    const hits = parseDirectory(
      JSON.stringify([
        {
          name: ' Jazz FM ',
          url: 'http://a.example.com/x.pls',
          url_resolved: 'http://stream.a.example.com/jazz',
          country: 'UK',
          codec: 'MP3',
          bitrate: 128,
        },
        { name: 'Only url', url: 'https://b.example.com/live', url_resolved: '' },
        { name: 'No stream', url: 'rtsp://c.example.com/x' },
        { url: 'http://d.example.com/x' },
      ]),
    );
    expect(hits).toEqual([
      {
        name: 'Jazz FM',
        url: 'http://stream.a.example.com/jazz',
        country: 'UK',
        detail: 'MP3 · 128 kbps',
      },
      { name: 'Only url', url: 'https://b.example.com/live', country: '', detail: '' },
    ]);
    expect(parseDirectory('nope')).toEqual([]);
    expect(parseDirectory('{}')).toEqual([]);
  });
});

describe('playing a station', () => {
  it('is a live song with no length', () => {
    const t = stationTrack({ name: 'Jazz FM', url: 'http://s.example.com/live' });
    expect(t.title).toBe('Jazz FM');
    expect(t.durationMs).toBe(0);
    expect(t.remote).toEqual({ url: 'http://s.example.com/live', live: true });
    expect(t.id).toBeLessThan(0);
  });
});
