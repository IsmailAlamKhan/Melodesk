import type { BridgeEvent } from '../protocol';

/**
 * Sends events to the Rust host through Tauri's IPC. Only the `bridge_emit` command is
 * exposed to this webview (see apps/desktop/src-tauri/capabilities/player.json).
 *
 * The IPC object may not exist yet when this script first runs (Tauri injects its own
 * initialization script alongside ours), and never exists outside music.youtube.com, so
 * events are queued until it appears and dropped after a bounded wait.
 */
interface TauriInternals {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

const MAX_QUEUE = 64;
const queue: BridgeEvent[] = [];
let flushTimer: number | null = null;

function internals(): TauriInternals | null {
  const w = window as unknown as { __TAURI_INTERNALS__?: Partial<TauriInternals> };
  const i = w.__TAURI_INTERNALS__;
  return i && typeof i.invoke === 'function' ? (i as TauriInternals) : null;
}

function flush(): void {
  const ipc = internals();
  if (!ipc) {
    flushTimer ??= window.setTimeout(() => {
      flushTimer = null;
      flush();
    }, 100);
    return;
  }
  while (queue.length > 0) {
    const event = queue.shift();
    if (event) {
      void ipc.invoke('bridge_emit', { event }).catch(() => {
        /* host rejected or window closing; nothing useful to do inside the page */
      });
    }
  }
}

export function emit(event: BridgeEvent): void {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(event);
  flush();
}

export function log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
  emit({ type: 'log', level, message: message.slice(0, 4096) });
}
