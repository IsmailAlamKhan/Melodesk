import { definePlugin, type PluginTrack } from '../sdk';
import { createScrobbleTracker } from '../scrobble';

/** ListenBrainz scrobbling with a user token (https://listenbrainz.org/settings/). */
export const listenbrainz = definePlugin({
  manifest: {
    id: 'listenbrainz',
    name: 'ListenBrainz',
    version: '1.0.0',
    description: 'Submits what you listen to (title, artist, album) to your ListenBrainz account.',
    permissions: ['playback:read', 'network:fetch', 'storage:plugin'],
    hosts: ['api.listenbrainz.org'],
  },
  settingsFields: [
    { key: 'token', label: 'User token', type: 'password', hint: 'From listenbrainz.org/settings' },
  ],
  setup(ctx) {
    const tracker = createScrobbleTracker();
    let status = 'Idle';
    const token = (): string => String(ctx.settings['token'] ?? '');
    const submit = async (
      type: 'playing_now' | 'single',
      track: PluginTrack,
      listenedAt?: number,
    ): Promise<void> => {
      if (!ctx.fetch || !token()) {
        status = 'No token set';
        return;
      }
      const payload = {
        listen_type: type,
        payload: [
          {
            ...(type === 'single'
              ? { listened_at: Math.floor((listenedAt ?? Date.now()) / 1000) }
              : {}),
            track_metadata: {
              artist_name: track.artist.split(' • ')[0] ?? track.artist,
              track_name: track.title,
              ...(track.album ? { release_name: track.album } : {}),
              additional_info: {
                media_player: 'Melodesk',
                submission_client: 'Melodesk',
                music_service: 'music.youtube.com',
                origin_url: `https://music.youtube.com/watch?v=${track.videoId}`,
              },
            },
          },
        ],
      };
      const res = await ctx.fetch('https://api.listenbrainz.org/1/submit-listens', {
        method: 'POST',
        headers: { Authorization: `Token ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      status = res.ok
        ? type === 'single'
          ? `Scrobbled “${track.title}”`
          : `Now playing “${track.title}”`
        : `Error ${String(res.status)}`;
      if (!res.ok) ctx.log('warn', `ListenBrainz ${type} failed: ${String(res.status)}`);
    };
    const unsubTrack = ctx.player?.onTrackChange((track) => {
      const started = tracker.start(track);
      if (started) void submit('playing_now', started);
    });
    const unsubState = ctx.player?.onStateChange((state) => {
      const current = ctx.player?.current().track ?? null;
      const due = tracker.update(current, state) as (PluginTrack & { startedAt: number }) | null;
      if (due) void submit('single', due, due.startedAt);
    });
    return {
      status: () => status,
      dispose: () => {
        unsubTrack?.();
        unsubState?.();
      },
    };
  },
});
