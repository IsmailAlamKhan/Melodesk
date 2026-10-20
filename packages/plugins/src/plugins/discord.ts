import { definePlugin } from '../sdk';

/** Discord Rich Presence ("Listening to …"). Opt-in; needs the Discord desktop app running. */
export const discord = definePlugin({
  manifest: {
    id: 'discord',
    name: 'Discord Rich Presence',
    version: '1.0.0',
    description:
      'Shows the current song as your Discord activity, with a link to it on YouTube Music.',
    permissions: ['playback:read', 'native:discord'],
  },
  settingsFields: [
    { key: 'hideWhenPaused', label: 'Clear presence when paused', type: 'boolean', default: true },
  ],
  setup(ctx) {
    let status = 'Waiting for playback';
    const push = (): void => {
      const { track, state } = ctx.player?.current() ?? { track: null, state: null };
      if (!ctx.native || !track) return;
      const hideWhenPaused = ctx.settings['hideWhenPaused'] !== false;
      if (!state?.playing && hideWhenPaused) {
        void ctx.native.invoke('discord_clear').then(() => {
          status = 'Paused (presence cleared)';
        });
        return;
      }
      const now = Date.now();
      const startMs = state ? now - Math.round(state.positionSeconds * 1000) : null;
      const endMs =
        state && startMs !== null && state.durationSeconds > 0
          ? startMs + Math.round(state.durationSeconds * 1000)
          : null;
      ctx.native
        .invoke('discord_set_activity', {
          activity: {
            details: track.title,
            state: track.artist,
            largeImage: track.artworkUrl,
            largeText: track.album ?? track.title,
            startMs: state?.playing ? startMs : null,
            endMs: state?.playing ? endMs : null,
            buttonLabel: 'Open in YouTube Music',
            buttonUrl: `https://music.youtube.com/watch?v=${track.videoId}`,
          },
        })
        .then(() => {
          status = `Showing “${track.title}”`;
        })
        .catch((e: unknown) => {
          status = String(e);
        });
    };
    const unsubTrack = ctx.player?.onTrackChange(push);
    let lastPlaying: boolean | null = null;
    const unsubState = ctx.player?.onStateChange((s) => {
      // Only re-send on play/pause flips; Discord rate-limits presence updates.
      if (s.playing !== lastPlaying) {
        lastPlaying = s.playing;
        push();
      }
    });
    const unsubSettings = ctx.onSettingsChange(push);
    push();
    return {
      status: () => status,
      dispose: () => {
        unsubTrack?.();
        unsubState?.();
        unsubSettings();
        void ctx.native?.invoke('discord_clear');
      },
    };
  },
});
