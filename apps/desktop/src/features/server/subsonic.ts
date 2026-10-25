/**
 * A client for Subsonic-compatible servers (Navidrome, Airsonic, Gonic, Subsonic itself): browse the
 * user's own music library on their server and play it. Calls go through the app's fetch for hosts the
 * user added (`net_text`), never straight from the page.
 */
import { invoke } from '@tauri-apps/api/core';
import type { RemoteSong } from '../local-music/remote';
import { md5 } from './md5';

export interface ServerConfig {
  /** The server's address, for example https://music.example.com (a path is fine: https://host/navidrome). */
  url: string;
  user: string;
  password: string;
}

const API_VERSION = '1.16.1';
const CLIENT = 'melodesk';

/** The address without a trailing slash (and without `/rest`, in case that was pasted too). */
export function baseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/+$/u, '')
    .replace(/\/rest$/u, '');
}

const randomSalt = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

/** A URL for one API call, signed with a fresh salt: md5(password + salt) goes instead of the password. */
export function signedUrl(
  cfg: ServerConfig,
  method: string,
  params: Record<string, string | number> = {},
  salt: string = randomSalt(),
): string {
  const query = new URLSearchParams({
    u: cfg.user,
    t: md5(cfg.password + salt),
    s: salt,
    v: API_VERSION,
    c: CLIENT,
    f: 'json',
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  return `${baseUrl(cfg.url)}/rest/${method}.view?${query.toString()}`;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.map(obj) : v ? [obj(v)] : []);
const str = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The answer's content, or an error with the server's own message. */
export function unwrap(text: string): Json {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error('That address did not answer like a Subsonic server.');
  }
  const response = obj(obj(body)['subsonic-response']);
  if (response['status'] !== 'ok') {
    const error = obj(response['error']);
    throw new Error(str(error['message']) || 'The server refused the request.');
  }
  return response;
}

export async function call(
  cfg: ServerConfig,
  method: string,
  params: Record<string, string | number> = {},
): Promise<Json> {
  return unwrap(await invoke<string>('net_text', { url: signedUrl(cfg, method, params) }));
}

export interface ServerAlbum {
  id: string;
  name: string;
  artist: string;
  artistId: string;
  year: number | null;
  songCount: number;
  coverArt: string | null;
}
export interface ServerArtist {
  id: string;
  name: string;
  albumCount: number;
  coverArt: string | null;
}
export interface ServerPlaylist {
  id: string;
  name: string;
  songCount: number;
}
export interface ServerSong {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string;
  track: number | null;
  disc: number | null;
  year: number | null;
  genre: string | null;
  durationSeconds: number;
  coverArt: string | null;
  contentType: string | null;
}

export const parseAlbum = (a: Json): ServerAlbum => ({
  id: str(a['id']),
  name: str(a['name']) || str(a['title']) || 'Unknown album',
  artist: str(a['artist']) || 'Unknown artist',
  artistId: str(a['artistId']),
  year: num(a['year']),
  songCount: num(a['songCount']) ?? 0,
  coverArt: str(a['coverArt']) || null,
});

export const parseArtist = (a: Json): ServerArtist => ({
  id: str(a['id']),
  name: str(a['name']) || 'Unknown artist',
  albumCount: num(a['albumCount']) ?? 0,
  coverArt: str(a['coverArt']) || null,
});

export const parseSong = (s: Json): ServerSong => ({
  id: str(s['id']),
  title: str(s['title']) || 'Unknown title',
  artist: str(s['artist']) || 'Unknown artist',
  album: str(s['album']),
  albumId: str(s['albumId']),
  track: num(s['track']),
  disc: num(s['discNumber']),
  year: num(s['year']),
  genre: str(s['genre']) || null,
  durationSeconds: num(s['duration']) ?? 0,
  coverArt: str(s['coverArt']) || null,
  contentType: str(s['contentType']) || null,
});

export const parsePlaylist = (p: Json): ServerPlaylist => ({
  id: str(p['id']),
  name: str(p['name']) || 'Playlist',
  songCount: num(p['songCount']) ?? 0,
});

export const albumsOf = (r: Json, key = 'albumList2'): ServerAlbum[] =>
  list(obj(r[key])['album'])
    .map(parseAlbum)
    .filter((a) => a.id);

export const artistsOf = (r: Json): ServerArtist[] =>
  list(obj(r['artists'])['index'])
    .flatMap((i) => list(i['artist']))
    .map(parseArtist)
    .filter((a) => a.id);

export const songsOf = (r: Json, parent: string, key: string): ServerSong[] =>
  list(obj(r[parent])[key])
    .map(parseSong)
    .filter((s) => s.id);

export type AlbumListType = 'newest' | 'recent' | 'frequent' | 'random' | 'alphabeticalByName';

export const api = {
  ping: (cfg: ServerConfig) => call(cfg, 'ping'),
  albums: async (cfg: ServerConfig, type: AlbumListType, size = 60, offset = 0) =>
    albumsOf(await call(cfg, 'getAlbumList2', { type, size, offset })),
  artists: async (cfg: ServerConfig) => artistsOf(await call(cfg, 'getArtists')),
  artistAlbums: async (cfg: ServerConfig, id: string) =>
    albumsOf(await call(cfg, 'getArtist', { id }), 'artist'),
  album: async (cfg: ServerConfig, id: string) => {
    const r = await call(cfg, 'getAlbum', { id });
    return { album: parseAlbum(obj(r['album'])), songs: songsOf(r, 'album', 'song') };
  },
  playlists: async (cfg: ServerConfig) =>
    list(obj((await call(cfg, 'getPlaylists'))['playlists'])['playlist']).map(parsePlaylist),
  playlist: async (cfg: ServerConfig, id: string) => {
    const r = await call(cfg, 'getPlaylist', { id });
    return { playlist: parsePlaylist(obj(r['playlist'])), songs: songsOf(r, 'playlist', 'entry') };
  },
  search: async (cfg: ServerConfig, query: string) => {
    const r = obj(
      (await call(cfg, 'search3', { query, songCount: 40, albumCount: 20, artistCount: 10 }))[
        'searchResult3'
      ],
    );
    return {
      songs: list(r['song'])
        .map(parseSong)
        .filter((s) => s.id),
      albums: list(r['album'])
        .map(parseAlbum)
        .filter((a) => a.id),
      artists: list(r['artist'])
        .map(parseArtist)
        .filter((a) => a.id),
    };
  },
};

export const coverUrl = (
  cfg: ServerConfig,
  coverArt: string | null,
  size = 640,
): string | undefined =>
  coverArt ? signedUrl(cfg, 'getCoverArt', { id: coverArt, size }) : undefined;

/** A song the player can queue: it is fetched from the server when it is played. */
export function toRemoteSong(cfg: ServerConfig, s: ServerSong): RemoteSong {
  const cover = coverUrl(cfg, s.coverArt);
  return {
    key: `subsonic:${baseUrl(cfg.url)}:${s.id}`,
    title: s.title,
    artist: s.artist,
    album: s.album || null,
    durationMs: s.durationSeconds * 1000,
    year: s.year,
    trackNo: s.track,
    discNo: s.disc,
    genre: s.genre,
    source: {
      url: signedUrl(cfg, 'stream', { id: s.id }),
      ...(cover ? { coverUrl: cover } : {}),
      ...(s.contentType ? { mime: s.contentType } : {}),
    },
  };
}
