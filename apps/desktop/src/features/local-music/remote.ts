import type { LocalTrack, RemoteSource } from './library';

/** FNV-1a: the same key always gives the same number. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A number for a song that is not in the library, from a key naming where it is (a server and its id,
 * a feed's episode, a station). Negative, so it never collides with a library row; stable, so the same
 * song is the same one in the queue, the history and the saved place.
 */
export const remoteId = (key: string): number => -(hash(key) % 0x3fffffff) - 1;

export interface RemoteSong {
  /** Names the song across sources, for example `subsonic:https://host:id`. */
  key: string;
  title: string;
  artist: string;
  album: string | null;
  durationMs: number;
  year?: number | null;
  trackNo?: number | null;
  discNo?: number | null;
  genre?: string | null;
  source: RemoteSource;
}

/** The queue's kind of song, for something that is fetched from the web. */
export function remoteTrack(song: RemoteSong): LocalTrack {
  return {
    id: remoteId(song.key),
    path: '',
    title: song.title,
    artist: song.artist,
    album: song.album,
    albumArtist: null,
    trackNo: song.trackNo ?? null,
    discNo: song.discNo ?? null,
    year: song.year ?? null,
    genre: song.genre ?? null,
    durationMs: song.durationMs,
    hasArt: false,
    lyrics: null,
    replayGainDb: null,
    replayPeak: null,
    remote: song.source,
  };
}
