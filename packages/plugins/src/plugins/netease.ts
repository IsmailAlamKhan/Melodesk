import { definePlugin, type LyricsResult, type PluginTrack } from '../sdk';
import { parseLrc } from '../lrc';

interface Song {
  id: number;
  name: string;
  /** Milliseconds. */
  duration: number;
  artists?: { name: string }[];
}

/** Lowercase letters and digits only, so "Yellow (Remastered)" and "yellow" compare alike. */
const plain = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * The search result that is most likely the track: the title has to match, and among those the
 * one whose length and artist fit best. Null when nothing is close, since wrong lyrics are worse
 * than none.
 */
export function pickSong(songs: readonly Song[], track: PluginTrack): Song | null {
  const title = plain(track.title);
  const artist = plain(track.artist.split(' • ')[0] ?? track.artist);
  // With no artist to check, a title that matches exactly has to be enough.
  const needed = artist ? 3 : 2;
  let best: { song: Song; score: number } | null = null;
  for (const song of songs) {
    const name = plain(song.name);
    if (!name || !(name === title || name.includes(title) || title.includes(name))) continue;
    let score = name === title ? 2 : 0;
    if (
      artist &&
      song.artists?.some((a) => plain(a.name) === artist || artist.includes(plain(a.name)))
    )
      score += 3;
    if (track.durationSeconds) {
      const off = Math.abs(song.duration / 1000 - track.durationSeconds);
      if (off <= 3) score += 3;
      else if (off <= 10) score += 1;
      else score -= 3;
    }
    if (!best || score > best.score) best = { song, score };
  }
  return best && best.score >= needed ? best.song : null;
}

/** Drops the credit lines NetEase puts first ("作词 : …", "Lyrics by …") and empty timestamps. */
export function cleanLrc(lrc: string): string {
  return lrc
    .split(/\r?\n/u)
    .filter((line) => {
      const text = line.replace(/\[[^\]]*\]/gu, '').trim();
      if (!/\[\d/u.test(line)) return false;
      return !/^(作词|作曲|编曲|制作人|词|曲|lyrics?\s*by|composed?\s*by|arranged?\s*by|produced?\s*by)\s*[:：]/iu.test(
        text,
      );
    })
    .join('\n');
}

/** Timed lyrics from NetEase Cloud Music's public search and lyric endpoints. */
export const netease = definePlugin({
  manifest: {
    id: 'netease',
    name: 'NetEase lyrics',
    version: '1.0.0',
    description:
      'Timed lyrics from NetEase Cloud Music, good for Asian and many other languages. Sends the track title and artist to music.163.com. An unofficial, public API: it can change or disappear.',
    permissions: ['network:fetch'],
    hosts: ['music.163.com'],
    provides: ['lyrics'],
  },
  setup(ctx) {
    const fetch = ctx.fetch;
    return {
      lyricsProvider: async (track): Promise<LyricsResult | null> => {
        if (!fetch) return null;
        const query = `${track.title} ${track.artist.split(' • ')[0] ?? ''}`.trim();
        const search = await fetch(
          `https://music.163.com/api/search/get?${new URLSearchParams({ s: query, type: '1', limit: '8' }).toString()}`,
        );
        if (!search.ok) return null;
        const found = (await search.json()) as { result?: { songs?: Song[] } };
        const song = pickSong(found.result?.songs ?? [], track);
        if (!song) return null;
        const res = await fetch(
          `https://music.163.com/api/song/lyric?${new URLSearchParams({ id: String(song.id), lv: '-1', kv: '-1', tv: '-1' }).toString()}`,
        );
        if (!res.ok) return null;
        const body = (await res.json()) as { lrc?: { lyric?: string } };
        const lines = parseLrc(cleanLrc(body.lrc?.lyric ?? ''));
        if (lines.length < 3) return null;
        return {
          text: lines.map((l) => l.text).join('\n'),
          synced: lines,
          source: 'Lyrics from NetEase Cloud Music',
        };
      },
    };
  },
});
