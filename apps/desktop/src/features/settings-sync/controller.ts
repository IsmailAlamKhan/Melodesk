import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { db } from '../../data/persister';
import { kvDel, kvGet, kvSet, onKvChange } from '../../data/kv';
import { syncOnce, type SyncIo } from './engine';
import { isSynced } from './snapshot';

const FOLDER_KEY = 'sync:folder';
const DEVICE_KEY = 'sync:device';
const LAST_KEY = 'sync:last';
/** A change is sent a few seconds after the last one, not on every keystroke of a slider. */
const SEND_DELAY_MS = 4000;
/** How often the folder is looked at for a file another computer wrote. */
const CHECK_EVERY_MS = 60_000;

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';

interface SyncState {
  folder: string | null;
  status: SyncStatus;
  /** When it last finished, in ms since 1970. */
  lastAt: number | null;
  error: string | null;
  /** Settings were taken from another computer while running: the app should start again to use them. */
  needsReload: boolean;
  loaded: boolean;
}

export const useSync = create<SyncState>(() => ({
  folder: null,
  status: 'off',
  lastAt: null,
  error: null,
  needsReload: false,
  loaded: false,
}));

const io: SyncIo = {
  read: () => invoke<string | null>('sync_read'),
  write: (text) => invoke('sync_write', { text }),
};

async function deviceId(): Promise<string> {
  const known = await kvGet(DEVICE_KEY);
  if (known) return known;
  const id = crypto.randomUUID().slice(0, 8);
  await kvSet(DEVICE_KEY, id);
  return id;
}

let running: Promise<void> = Promise.resolve();
let lastStamp: number | null = null;

/** One round of syncing; rounds run one after another, never two at once. */
export function syncNow(): Promise<void> {
  const round = running.then(async () => {
    if (useSync.getState().folder === null) return;
    useSync.setState({ status: 'syncing', error: null });
    try {
      const result = await syncOnce(await db(), io, await deviceId());
      lastStamp = await invoke<number | null>('sync_stamp');
      const lastAt = Date.now();
      await kvSet(LAST_KEY, String(lastAt));
      useSync.setState((s) => ({
        status: 'idle',
        lastAt,
        needsReload: s.needsReload || result.applied.length > 0,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      useSync.setState({
        status: 'error',
        error: message === 'not-melodesk-sync-file' ? 'not-ours' : message,
      });
    }
  });
  running = round.catch(() => undefined);
  return round;
}

/** Start syncing with this folder (and remember it on this computer). */
export async function chooseFolder(path: string): Promise<void> {
  const shown = await invoke<string | null>('sync_set_folder', { path });
  if (shown === null) return;
  await kvSet(FOLDER_KEY, shown);
  lastStamp = null;
  useSync.setState({ folder: shown, status: 'idle', error: null });
  await syncNow();
}

export async function stopSyncing(): Promise<void> {
  await invoke('sync_set_folder', { path: null });
  await kvDel(FOLDER_KEY);
  await kvDel(LAST_KEY);
  useSync.setState({ folder: null, status: 'off', error: null, lastAt: null });
}

/** Pick up where it left off, and keep going: on changes here, when the window is used, and on a timer. */
export function startSync(): () => void {
  let timer = 0;
  let poll = 0;
  // An object, not a bare `let`: the async start below must see the change made by the stop function.
  const run = { stopped: false };
  const later = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void syncNow();
    }, SEND_DELAY_MS);
  };
  const offKv = onKvChange((key) => {
    if (isSynced(key)) later();
  });
  const onFocus = (): void => {
    void syncNow();
  };
  window.addEventListener('focus', onFocus);
  poll = window.setInterval(() => {
    if (useSync.getState().folder === null) return;
    void invoke<number | null>('sync_stamp')
      .then((stamp) => {
        if (stamp !== lastStamp) void syncNow();
      })
      .catch(() => undefined);
  }, CHECK_EVERY_MS);
  void (async () => {
    const folder = await kvGet(FOLDER_KEY).catch(() => null);
    const last = await kvGet(LAST_KEY).catch(() => null);
    if (run.stopped) return;
    if (!folder) {
      useSync.setState({ loaded: true });
      return;
    }
    useSync.setState({ folder, lastAt: last ? Number(last) : null, status: 'idle', loaded: true });
    try {
      await invoke('sync_set_folder', { path: folder });
    } catch (err) {
      // The folder is gone (a drive that is not plugged in, a cloud folder that was moved).
      useSync.setState({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    await syncNow();
  })();
  return () => {
    run.stopped = true;
    window.clearTimeout(timer);
    window.clearInterval(poll);
    window.removeEventListener('focus', onFocus);
    offKv();
  };
}
