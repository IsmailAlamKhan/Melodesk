import { describe, expect, it } from 'vitest';
import { bestMatch, normalize, scoreCandidate } from './match';
import {
  entriesFromCsv,
  entriesFromM3u,
  nameFromFile,
  parseCsvRows,
  parseImport,
  splitLabel,
  videoIdFromUrl,
} from './parse';

describe('videoIdFromUrl', () => {
  it('finds the id in YouTube links', () => {
    expect(videoIdFromUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(videoIdFromUrl('https://www.youtube.com/watch?list=PL1&v=dQw4w9WgXcQ&t=3')).toBe(
      'dQw4w9WgXcQ',
    );
    expect(videoIdFromUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(videoIdFromUrl('/music/song.mp3')).toBeNull();
    expect(videoIdFromUrl('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
});

describe('CSV', () => {
  it('reads quoted cells, doubled quotes and line breaks in a cell', () => {
    const rows = parseCsvRows('a,b\n"x, y","say ""hi"""\n"two\nlines",z\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['two\nlines', 'z'],
    ]);
  });
  it('guesses a semicolon or tab separator', () => {
    expect(parseCsvRows('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsvRows('a\tb\n1\t2')[1]).toEqual(['1', '2']);
  });
  it('reads a Spotify-style export', () => {
    const csv =
      'Track URI,Track Name,Album Name,Artist Name(s),Duration (ms)\n' +
      'spotify:track:1,Instant Crush,Random Access Memories,Daft Punk;Julian Casablancas,337560\n';
    expect(entriesFromCsv(csv)).toEqual([
      {
        title: 'Instant Crush',
        artist: 'Daft Punk, Julian Casablancas',
        album: 'Random Access Memories',
        videoId: null,
        durationSeconds: 338,
      },
    ]);
  });
  it('reads our own export, with its comment line, ids and links', () => {
    const csv =
      '# My mix\n"title","artists","album","duration_seconds","video_id","url"\n' +
      '"Song","A; B","Alb","200","dQw4w9WgXcQ","https://music.youtube.com/watch?v=dQw4w9WgXcQ"\n';
    const [e] = entriesFromCsv(csv);
    expect(e).toMatchObject({
      title: 'Song',
      artist: 'A, B',
      videoId: 'dQw4w9WgXcQ',
      durationSeconds: 200,
    });
  });
  it('is empty when there is no title column', () => {
    expect(entriesFromCsv('x,y\n1,2')).toEqual([]);
  });
});

describe('M3U', () => {
  it('takes titles from EXTINF lines, ids from links, names from files', () => {
    const m3u = [
      '#EXTM3U',
      '#EXTINF:215,Daft Punk - Get Lucky',
      '/music/01.mp3',
      '#EXTINF:-1,Some Title',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      '/music/Brook - Solo%20Walk.flac',
    ].join('\n');
    const e = entriesFromM3u(m3u);
    expect(e[0]).toMatchObject({ title: 'Get Lucky', artist: 'Daft Punk', durationSeconds: 215 });
    expect(e[1]).toMatchObject({
      title: 'Some Title',
      videoId: 'dQw4w9WgXcQ',
      durationSeconds: null,
    });
    expect(e[2]).toMatchObject({ title: 'Solo Walk', artist: 'Brook' });
  });
});

describe('parseImport', () => {
  it('picks the reader by name and by content', () => {
    expect(parseImport('Daft Punk - One More Time\nBrook - Solo Walk', 'list.txt')).toHaveLength(2);
    expect(parseImport('{"tracks":[{"title":"T","artists":["A"]}]}', 'x.json')[0]).toMatchObject({
      title: 'T',
      artist: 'A',
    });
    expect(parseImport('#EXTM3U\n#EXTINF:1,A - B\nf.mp3', 'noext')).toHaveLength(1);
    expect(parseImport('title,artist\nT,A', 'x.csv')[0]?.title).toBe('T');
    expect(parseImport('', 'x.csv')).toEqual([]);
  });
  it('splits "Artist - Title" and names a playlist from its file', () => {
    expect(splitLabel('Artist – Title')).toEqual({ artist: 'Artist', title: 'Title' });
    expect(splitLabel('Only a title')).toEqual({ artist: '', title: 'Only a title' });
    expect(nameFromFile('/home/me/My_Road_Trip.m3u8')).toBe('My Road Trip');
  });
});

describe('matching', () => {
  const cand = (title: string, artists: string[], seconds: number | null = null) => ({
    videoId: 'abcdefghijk',
    title,
    artists,
    durationSeconds: seconds,
  });
  const entry = (title: string, artist = '', seconds: number | null = null) => ({
    title,
    artist,
    album: null,
    videoId: null,
    durationSeconds: seconds,
  });

  it('normalises away what differs between services', () => {
    expect(normalize('Instant Crush (feat. Julian Casablancas)')).toBe('instant crush');
    expect(normalize('Héroes - 2017 Remaster')).toBe('heroes');
    expect(normalize('Rock & Roll')).toBe('rock and roll');
  });
  it('prefers the right song by the right artist', () => {
    const good = cand('Get Lucky', ['Daft Punk'], 369);
    const cover = cand('Get Lucky', ['Some Cover Band'], 369);
    expect(scoreCandidate(entry('Get Lucky', 'Daft Punk', 369), good)).toBeGreaterThan(
      scoreCandidate(entry('Get Lucky', 'Daft Punk', 369), cover),
    );
    expect(bestMatch(entry('Get Lucky', 'Daft Punk'), [cover, good])?.candidate).toBe(good);
  });
  it('accepts a title with extra words, and a missing artist', () => {
    expect(
      bestMatch(entry('Instant Crush', 'Daft Punk'), [
        cand('Instant Crush (feat. Julian Casablancas)', ['Daft Punk', 'Julian Casablancas']),
      ]),
    ).not.toBeNull();
    expect(bestMatch(entry('Solo Walk'), [cand('Solo Walk', ['Brook'])])).not.toBeNull();
  });
  it('rejects something else', () => {
    expect(
      bestMatch(entry('Get Lucky', 'Daft Punk'), [cand('Smells Like Teen Spirit', ['Nirvana'])]),
    ).toBeNull();
    expect(bestMatch(entry('Get Lucky', 'Daft Punk'), [])).toBeNull();
  });
});
