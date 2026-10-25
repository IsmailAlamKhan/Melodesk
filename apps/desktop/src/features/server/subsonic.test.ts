import { describe, expect, it } from 'vitest';
import {
  albumsOf,
  artistsOf,
  baseUrl,
  parseSong,
  signedUrl,
  songsOf,
  toRemoteSong,
  unwrap,
  type ServerConfig,
} from './subsonic';

const cfg: ServerConfig = {
  url: 'https://music.example.com/navidrome/',
  user: 'ann',
  password: 'sesame',
};

describe('signing', () => {
  it('uses md5(password + salt), never the password', () => {
    const url = new URL(signedUrl(cfg, 'ping', {}, 'c19b2d'));
    expect(url.origin).toBe('https://music.example.com');
    expect(url.pathname).toBe('/navidrome/rest/ping.view');
    expect(url.searchParams.get('u')).toBe('ann');
    expect(url.searchParams.get('s')).toBe('c19b2d');
    expect(url.searchParams.get('t')).toBe('26719a1196d2a940705a59634eb18eab');
    expect(url.searchParams.get('f')).toBe('json');
    expect(url.toString()).not.toContain('sesame');
  });
  it('adds the parameters of a call', () => {
    const url = new URL(signedUrl(cfg, 'getAlbumList2', { type: 'newest', size: 60 }, 'abc'));
    expect(url.searchParams.get('type')).toBe('newest');
    expect(url.searchParams.get('size')).toBe('60');
  });
  it('takes the address as people paste it', () => {
    expect(baseUrl(' https://host/ ')).toBe('https://host');
    expect(baseUrl('https://host/rest')).toBe('https://host');
    expect(baseUrl('http://host:4533//')).toBe('http://host:4533');
  });
});

describe('answers', () => {
  it('returns the content of an ok answer', () => {
    const r = unwrap(
      '{"subsonic-response":{"status":"ok","version":"1.16.1","albumList2":{"album":[]}}}',
    );
    expect(r['version']).toBe('1.16.1');
  });
  it('says what the server complained about', () => {
    expect(() =>
      unwrap(
        '{"subsonic-response":{"status":"failed","error":{"code":40,"message":"Wrong username or password"}}}',
      ),
    ).toThrow('Wrong username or password');
    expect(() => unwrap('{"subsonic-response":{"status":"failed"}}')).toThrow(/refused/u);
  });
  it('says so when it is not a Subsonic server', () => {
    expect(() => unwrap('<html>hello</html>')).toThrow(/did not answer like a Subsonic server/u);
    expect(() => unwrap('{"other":1}')).toThrow();
  });
  it('reads albums, with one album given as an object rather than a list', () => {
    const many = albumsOf({
      albumList2: {
        album: [
          {
            id: '1',
            name: 'A',
            artist: 'X',
            artistId: '9',
            year: 2001,
            songCount: 10,
            coverArt: 'al-1',
          },
        ],
      },
    });
    expect(many).toEqual([
      {
        id: '1',
        name: 'A',
        artist: 'X',
        artistId: '9',
        year: 2001,
        songCount: 10,
        coverArt: 'al-1',
      },
    ]);
    expect(albumsOf({ albumList2: { album: { id: '2', name: 'B' } } })[0]).toMatchObject({
      id: '2',
      name: 'B',
      artist: 'Unknown artist',
    });
    expect(albumsOf({})).toEqual([]);
  });
  it('flattens the artist index', () => {
    const r = {
      artists: {
        index: [
          { name: 'A', artist: [{ id: 'a1', name: 'Abba', albumCount: 3 }] },
          {
            name: 'B',
            artist: [
              { id: 'b1', name: 'Blur' },
              { id: 'b2', name: 'Bjork', albumCount: 5 },
            ],
          },
        ],
      },
    };
    expect(artistsOf(r).map((a) => a.name)).toEqual(['Abba', 'Blur', 'Bjork']);
    expect(artistsOf(r)[1]?.albumCount).toBe(0);
  });
  it('reads songs and skips entries without an id', () => {
    const songs = songsOf(
      {
        album: {
          song: [
            {
              id: 's1',
              title: 'T',
              artist: 'A',
              duration: 200,
              track: 3,
              discNumber: 1,
              contentType: 'audio/flac',
              coverArt: 'c',
            },
            { title: 'no id' },
          ],
        },
      },
      'album',
      'song',
    );
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({
      id: 's1',
      durationSeconds: 200,
      track: 3,
      disc: 1,
      contentType: 'audio/flac',
    });
    expect(parseSong({ id: 'x' })).toMatchObject({ title: 'Unknown title', durationSeconds: 0 });
  });
});

describe('queueing a song', () => {
  it('points at the server’s stream and cover, and keeps its type', () => {
    const song = parseSong({
      id: 's1',
      title: 'T',
      artist: 'A',
      album: 'Al',
      duration: 200,
      coverArt: 'cv',
      contentType: 'audio/mpeg',
      year: 2020,
    });
    const remote = toRemoteSong(cfg, song);
    expect(remote.key).toBe('subsonic:https://music.example.com/navidrome:s1');
    expect(remote.durationMs).toBe(200_000);
    const stream = new URL(remote.source.url);
    expect(stream.pathname).toBe('/navidrome/rest/stream.view');
    expect(stream.searchParams.get('id')).toBe('s1');
    expect(new URL(remote.source.coverUrl ?? '').searchParams.get('id')).toBe('cv');
    expect(remote.source.mime).toBe('audio/mpeg');
  });
});
