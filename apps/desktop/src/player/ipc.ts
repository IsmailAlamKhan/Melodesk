import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import type { PlayerCommand } from '@melodesk/bridge/protocol';
import { attachBackends, backendById, resolveRoute, allBackends } from './backends';
import { usePlayerStore, type PlayerStore } from './store';

/**
 * A command for a source that is not running in this window (the mini player is another window; your
 * own music plays in the main one) is handed to the main window under this name. The tray, global
 * shortcuts and media keys (Rust) use it too.
 */
const FORWARD_EVENT = 'local:command';

/**
 * Send a command to whichever source should get it (see `player/backends.ts`). The source that is
 * playing answers what it can; something that starts a different source makes the playing one step
 * aside first.
 */
export async function sendCommand(command: PlayerCommand): Promise<void> {
  const route = resolveRoute(command, usePlayerStore.getState().source, allBackends());
  if (!route) {
    // Nothing is playing and no source answers (YouTube Music is switched off): a request for page
    // data has to fail, not wait for an answer that cannot come.
    if (command.type === 'data') throw new Error('no source is available for this');
    return;
  }
  if (route.yieldFrom) backendById(route.yieldFrom)?.yield?.();
  const target = backendById(route.to);
  if (target?.send) await target.send(command);
  else await emitTo('main', FORWARD_EVENT, command);
}

export async function setPlayerVisible(visible: boolean): Promise<void> {
  await invoke('player_set_visible', { visible });
  usePlayerStore.setState({ playerVisible: visible });
}

let detach: (() => void) | null = null;

/**
 * Start listening, once per window: each source's own reports (`attach`), and the main window's
 * snapshots of a source that plays there, for the windows that only mirror it (the mini player).
 */
export function subscribeToPlayer(): void {
  if (detach) return;
  const stopBackends = attachBackends();
  let stopSnapshots: (() => void) | null = null;
  let stopped = false;
  void listen<Partial<Pick<PlayerStore, 'source' | 'track' | 'state' | 'queue' | 'flags'>>>(
    'local:snapshot',
    ({ payload }) => {
      usePlayerStore.setState(payload);
    },
  ).then((fn) => {
    if (stopped) fn();
    else stopSnapshots = fn;
  });
  detach = () => {
    stopped = true;
    stopBackends();
    stopSnapshots?.();
    detach = null;
  };
}
