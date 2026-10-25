import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  BRIDGE_EVENT_CHANNEL,
  BridgeEventSchema,
  type PlayerCommand,
} from '@melodesk/bridge/protocol';
import { emitTo } from '@tauri-apps/api/event';
import { rejectAllPending, resolveDataResponse } from './data';
import { localPlayback, routeCommand } from './router';
import { usePlayerStore, type PlayerStore } from './store';

const REJECTED_EVENTS_BEFORE_DEGRADED = 10;

/** Send a command to the player webview. Rust re-validates it before evaluating anything. */
export async function sendCommand(command: PlayerCommand): Promise<void> {
  const route = routeCommand(command, usePlayerStore.getState().source);
  if (route === 'local') {
    // The local player lives in the main window; another window (the mini player) asks it.
    const player = localPlayback();
    if (player) player.handle(command);
    else await emitTo('main', 'local:command', command);
    return;
  }
  if (route === 'takeover') localPlayback()?.yieldToYouTube();
  await invoke('player_command', { command });
}

export async function setPlayerVisible(visible: boolean): Promise<void> {
  await invoke('player_set_visible', { visible });
  usePlayerStore.setState({ playerVisible: visible });
}

let unlisten: (() => void) | null = null;

/** Subscribe once to the bridge event stream and fold validated events into the store. */
export function subscribeToPlayer(): void {
  if (unlisten) return;
  // The player window was closed (it hides rather than quits). Video is only decoded for a window
  // that can be seen, so go back to audio instead of decoding frames nobody watches.
  void listen<boolean>('player:visible', ({ payload }) => {
    usePlayerStore.setState({ playerVisible: payload });
    if (!payload && usePlayerStore.getState().flags?.isVideo)
      void sendCommand({ type: 'setVideoMode', video: false }).catch(() => undefined);
  });
  // The mini player is another window: the main window sends it what a local song is doing.
  void listen<Partial<Pick<PlayerStore, 'source' | 'track' | 'state' | 'queue' | 'flags'>>>(
    'local:snapshot',
    ({ payload }) => {
      usePlayerStore.setState(payload);
    },
  );
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
    // A local song is playing: what the idle web player says about itself is not what to show.
    if (
      usePlayerStore.getState().source === 'local' &&
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
        usePlayerStore.setState({ state: ev.state });
        break;
      case 'track':
        usePlayerStore.setState({ track: ev.track });
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
    unlisten = fn;
    // The player window may have attached before we subscribed; ask for a fresh snapshot.
    void sendCommand({ type: 'requestState' }).catch(() => undefined);
  });
}
