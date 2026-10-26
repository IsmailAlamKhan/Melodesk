import {
  BRIDGE_EVENT_CHANNEL,
  BridgeEventSchema,
  type PlayerCommand,
} from '@melodesk/bridge/protocol';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { rejectAllPending, resolveDataResponse } from '../../player/data';
import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import type { PlaybackBackend } from '../../player/backends';

/** The id YouTube Music has as a playback source. */
export const SOURCE_ID = 'youtube';

const REJECTED_EVENTS_BEFORE_DEGRADED = 10;

/** Starting something from YouTube Music (opening a song or playlist, adding to the queue). */
const startsSomething = (c: PlayerCommand): boolean =>
  c.type === 'queueAdd' || (c.type === 'endpoint' && c.mode === 'navigate');

/**
 * Listen to the web player: the bridge in the hidden window reports what it is doing, and the events
 * are checked against the protocol before they reach the store. Runs in every window.
 */
function attach(): () => void {
  const stops: (() => void)[] = [];
  let stopped = false;
  // The player window was closed (it hides rather than quits). Video is only decoded for a window
  // that can be seen, so go back to audio instead of decoding frames nobody watches.
  void listen<boolean>('player:visible', ({ payload }) => {
    usePlayerStore.setState({ playerVisible: payload });
    if (!payload && usePlayerStore.getState().flags?.isVideo)
      void sendCommand({ type: 'setVideoMode', video: false }).catch(() => undefined);
  }).then((fn) => {
    if (stopped) fn();
    else stops.push(fn);
  });
  void listen<unknown>(BRIDGE_EVENT_CHANNEL, ({ payload }) => {
    const parsed = BridgeEventSchema.safeParse(payload);
    if (!parsed.success) {
      const rejected = usePlayerStore.getState().rejectedEvents + 1;
      usePlayerStore.setState((s) => ({
        rejectedEvents: rejected,
        health:
          rejected >= REJECTED_EVENTS_BEFORE_DEGRADED && s.health.status === 'ok'
            ? { status: 'degraded', reason: 'protocol-mismatch' }
            : s.health,
      }));
      if (import.meta.env.DEV) console.warn('rejected bridge event', parsed.error.issues, payload);
      return;
    }
    const ev = parsed.data;
    // Another source is playing: what the idle web player says about itself is not what to show.
    const playing = usePlayerStore.getState().source;
    if (
      playing !== '' &&
      playing !== SOURCE_ID &&
      (ev.type === 'track' || ev.type === 'state' || ev.type === 'queue' || ev.type === 'flags')
    )
      return;
    switch (ev.type) {
      case 'ready': {
        const wasReady = usePlayerStore.getState().ready;
        usePlayerStore.setState({
          ready: true,
          bridgeVersion: ev.bridgeVersion,
          loggedIn: ev.loggedIn,
        });
        // A second `ready` means the page reloaded; nothing in flight will ever answer.
        if (wasReady) rejectAllPending('player reloaded');
        break;
      }
      case 'dataResponse':
        resolveDataResponse(ev.requestId, ev.ok, ev.response, ev.error);
        break;
      case 'capabilities':
        usePlayerStore.setState({ capabilities: ev.found });
        if (import.meta.env.DEV)
          console.warn('[bridge] capabilities', JSON.stringify(ev.found), ev.notes?.join('\n'));
        break;
      case 'state':
        usePlayerStore.setState({ state: ev.state, source: SOURCE_ID });
        break;
      case 'track':
        usePlayerStore.setState({ track: ev.track, source: SOURCE_ID });
        break;
      case 'queue':
        usePlayerStore.setState({ queue: ev.queue });
        break;
      case 'flags':
        usePlayerStore.setState({ flags: ev.flags });
        break;
      case 'audio':
        usePlayerStore.setState({ audio: ev.audio });
        break;
      case 'health':
        usePlayerStore.setState({ health: { status: ev.status, reason: ev.reason } });
        break;
      case 'navigation':
        usePlayerStore.setState({ playerPath: ev.path });
        break;
      case 'log':
        if (import.meta.env.DEV)
          console[ev.level === 'debug' ? 'log' : ev.level](`[bridge] ${ev.message}`);
        break;
    }
  }).then((fn) => {
    if (stopped) fn();
    else stops.push(fn);
    // The player window may have attached before we subscribed; ask for a fresh snapshot.
    void sendCommand({ type: 'requestState' }).catch(() => undefined);
  });
  return () => {
    stopped = true;
    for (const stop of stops) stop();
  };
}

/** YouTube Music as a playback source: the official web player, in a hidden window, does the playing. */
export const youtubeBackend: PlaybackBackend = {
  id: SOURCE_ID,
  feature: 'youtube-music',
  fallback: true,
  // Everything the app can ask of a player, pages and account included, is answered by the web player.
  handles: () => true,
  starts: startsSomething,
  send: async (command) => {
    await invoke('player_command', { command });
  },
  attach,
};
