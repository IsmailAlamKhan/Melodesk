export * from './manifest';
export * from './sdk';
export { cleanTitle, lyricsCandidates, plainName, type SongGuess } from './candidates';
export { parseLrc } from './lrc';
export { createScrobbleTracker } from './scrobble';
export { lrclib, pickLrclib } from './plugins/lrclib';
export { listenbrainz } from './plugins/listenbrainz';
export { lastfm, md5 } from './plugins/lastfm';
export { discord } from './plugins/discord';
export { netease, pickSong, cleanLrc } from './plugins/netease';
export { lyricsovh } from './plugins/lyricsovh';
export { ollama, buildPrompt, parseGuesses } from './plugins/ollama';
import type { PluginDefinition } from './sdk';
import { lrclib } from './plugins/lrclib';
import { listenbrainz } from './plugins/listenbrainz';
import { lastfm } from './plugins/lastfm';
import { discord } from './plugins/discord';
import { netease } from './plugins/netease';
import { lyricsovh } from './plugins/lyricsovh';
import { ollama } from './plugins/ollama';

/** First-party plugins, in the order they appear in Settings. */
export const firstPartyPlugins: PluginDefinition[] = [
  lrclib,
  netease,
  lyricsovh,
  ollama,
  lastfm,
  listenbrainz,
  discord,
];
