/**
 * Shared scrobbling rules (Last.fm's): a track counts once it has played for half its length
 * or 4 minutes, whichever comes first, and only if it is longer than 30 seconds.
 */
import type { PluginPlaybackState, PluginTrack } from './sdk';

export interface ScrobbleTracker {
  /** Call on every state update; returns a track to scrobble exactly once per play. */
  update(
    track: PluginTrack | null,
    state: PluginPlaybackState | null,
    now?: number,
  ): PluginTrack | null;
  /** Call on track change; returns the track that just started (for "now playing"). */
  start(track: PluginTrack | null, now?: number): PluginTrack | null;
}

export function createScrobbleTracker(): ScrobbleTracker {
  let current: PluginTrack | null = null;
  let startedAt = 0;
  let listened = 0;
  let lastTick = 0;
  let scrobbled = false;
  return {
    start(track, now = Date.now()) {
      current = track;
      startedAt = now;
      listened = 0;
      lastTick = now;
      scrobbled = false;
      return track;
    },
    update(track, state, now = Date.now()) {
      if (!track || !state || track.videoId !== current?.videoId) {
        lastTick = now;
        return null;
      }
      if (state.playing) listened += Math.min(now - lastTick, 5000);
      lastTick = now;
      const duration =
        state.durationSeconds > 0 ? state.durationSeconds : (track.durationSeconds ?? 0);
      if (scrobbled || duration < 30) return null;
      const threshold = Math.min(duration * 500, 4 * 60 * 1000);
      if (listened >= threshold) {
        scrobbled = true;
        return { ...current, durationSeconds: duration, startedAt } as PluginTrack & {
          startedAt: number;
        };
      }
      return null;
    },
  };
}
