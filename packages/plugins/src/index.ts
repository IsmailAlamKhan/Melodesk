export * from './manifest';
export * from './sdk';
export { parseLrc } from './lrc';
export { createScrobbleTracker } from './scrobble';
export { lrclib } from './plugins/lrclib';
export { listenbrainz } from './plugins/listenbrainz';
export { lastfm, md5 } from './plugins/lastfm';
export { discord } from './plugins/discord';
import type { PluginDefinition } from './sdk';
import { lrclib } from './plugins/lrclib';
import { listenbrainz } from './plugins/listenbrainz';
import { lastfm } from './plugins/lastfm';
import { discord } from './plugins/discord';

/** First-party plugins, in the order they appear in Settings. */
export const firstPartyPlugins: PluginDefinition[] = [lrclib, lastfm, listenbrainz, discord];
