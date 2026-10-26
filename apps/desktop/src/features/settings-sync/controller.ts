import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { create } from 'zustand';
import { db } from '../../data/persister';
import { kvDel, kvGet, kvSet, onKvChange } from '../../data/kv';
import {
  deriveKeys,
  formatCode,
  generateCode,
  normalizeCode,
  open,
  seal,
  type Keys,
} from './crypto';
import { syncOnce, type SyncIo } from './engine';
import { isSynced } from './snapshot';

const FOLDER_KEY = 'sync:folder';
const MODE_KEY = 'sync:mode';
const ACCOUNT_KEY = 'sync:account';
const SERVER_KEY = 'sync:server-url';
const DEVICE_KEY = 'sync:device';
const LAST_KEY = 'sync:last';
/** A change is sent a few seconds after the last one, not on every keystroke of a slider. */
const SEND_DELAY_MS = 4000;
/** How often the place the file is kept is looked at for a file another computer wrote. */
const CHECK_EVERY_MS = 60_000;

/** What `sync_set_folder` and `sync_use_cloud` say about the folder. */
interface Chosen {
  path: string;
  /** It is a git repository, so syncing goes through git (a clone of a private GitHub repository, say). */
  git: boolean;
}

/** A cloud folder this computer has (iCloud Drive, OneDrive, Dropbox, Google Drive). */
export interface CloudOption {
  id: string;
  name: string;
  path: string;
}

/** Where the settings are kept: nowhere yet, a folder (a cloud one, or any other), or a GitHub account. */
export type SyncMode = 'off' | 'folder' | 'github' | 'server';
export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';

/** Signing in to GitHub: the code to type at github.com, and how it is going. */
export interface SignIn {
  state: 'starting' | 'waiting' | 'denied' | 'expired' | 'error';
  code?: string;
  uri?: string;
  error?: string;
}

interface SyncState {
  mode: SyncMode;
  folder: string | null;
  git: boolean;
  /** The GitHub user syncing goes through. */
  account: string | null;
  status: SyncStatus;
  /** When it last finished, in ms since 1970. */
  lastAt: number | null;
  error: string | null;
  /** Settings were taken from another computer while running: the app should start again to use them. */
  needsReload: boolean;
  loaded: boolean;
  clouds: CloudOption[];
  githubAvailable: boolean;
  signIn: SignIn | null;
  /** The Melodesk sync server in use, or the one last used (to fill the address in). */
  serverUrl: string | null;
  /** The server this build comes with, if any. */
  serverDefault: string | null;
  /** A sync code to show: a new one is shown once, to be written down. */
  shownCode: string | null;
}

export const useSync = create<SyncState>(() => ({
  mode: 'off',
  folder: null,
  git: false,
  account: null,
  status: 'off',
  lastAt: null,
  error: null,
  needsReload: false,
  loaded: false,
  clouds: [],
  githubAvailable: false,
  signIn: null,
  serverUrl: null,
  serverDefault: null,
  shownCode: null,
}));

const placeIo: SyncIo = {
  read: () => invoke<string | null>('sync_read'),
  write: (text) => invoke('sync_write', { text }),
};

// The Melodesk sync server: everything is encrypted here before it is sent (see crypto.ts).
let serverKeys: Keys | null = null;
/** Where the server's blob stood when it was last read (0: nothing there yet). */
let serverVersion = 0;

function serverIo(k: Keys): SyncIo {
  return {
    read: async () => {
      const blob = await invoke<{ version: number; data: string } | null>('sync_server_get', {
        id: k.id,
      });
      if (!blob) {
        serverVersion = 0;
        return null;
      }
      serverVersion = blob.version;
      const text = await open(k.key, blob.data);
      if (text === null) throw new Error('wrong-code');
      return text;
    },
    write: async (text) => {
      const res = await invoke<{ ok: boolean; version: number }>('sync_server_put', {
        id: k.id,
        data: await seal(k.key, text),
        ifVersion: serverVersion,
      });
      // Another computer wrote since this one read: read again and merge, then try once more.
      if (!res.ok) throw new Error('conflict');
      serverVersion = res.version;
    },
  };
}

const currentIo = (): SyncIo => {
  if (useSync.getState().mode === 'server') {
    if (!serverKeys) throw new Error('no-code');
    return serverIo(serverKeys);
  }
  return placeIo;
};

async function currentStamp(): Promise<number | null> {
  if (useSync.getState().mode === 'server')
    return serverKeys ? invoke<number | null>('sync_server_version', { id: serverKeys.id }) : null;
  return invoke<number | null>('sync_stamp');
}

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
    if (useSync.getState().mode === 'off') return;
    useSync.setState({ status: 'syncing', error: null });
    try {
      const full = useSync.getState().mode === 'server';
      let result: Awaited<ReturnType<typeof syncOnce>> | null = null;
      for (let attempt = 0; result === null; attempt++) {
        try {
          result = await syncOnce(await db(), currentIo(), await deviceId(), new Date(), full);
        } catch (err) {
          if (!(err instanceof Error && err.message === 'conflict') || attempt >= 2) throw err;
        }
      }
      lastStamp = await currentStamp();
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

/** Start syncing through a folder (and remember it on this computer). */
async function adoptFolder(chosen: Chosen): Promise<void> {
  await kvSet(FOLDER_KEY, chosen.path);
  await kvSet(MODE_KEY, 'folder');
  await kvDel(ACCOUNT_KEY);
  lastStamp = null;
  useSync.setState({
    mode: 'folder',
    folder: chosen.path,
    git: chosen.git,
    account: null,
    status: 'idle',
    error: null,
    signIn: null,
  });
  await syncNow();
}

export async function chooseFolder(path: string): Promise<void> {
  const chosen = await invoke<Chosen | null>('sync_set_folder', { path });
  if (chosen) await adoptFolder(chosen);
}

/** One click: sync through iCloud Drive, OneDrive, Dropbox or Google Drive. */
export async function connectCloud(id: string): Promise<void> {
  await adoptFolder(await invoke<Chosen>('sync_use_cloud', { id }));
}

/**
 * Sync through the Melodesk sync server. Without a code a new one is made (the first computer); with
 * one typed from another computer, this joins it. The code never leaves the computers: it makes the
 * key that encrypts everything and the id the server keeps it under.
 */
export async function connectServer(url: string, typedCode?: string): Promise<void> {
  const base = await invoke<string>('sync_server_check', { url });
  const given = typedCode === undefined ? null : normalizeCode(typedCode);
  if (typedCode !== undefined && given === null) throw new Error('bad-code');
  const code = given ?? generateCode();
  const keys = await deriveKeys(code);
  await invoke('sync_server_use', { url: base, code });
  if (given !== null) {
    // A mistyped code would quietly make a new, empty place: make sure there is something under it.
    const there = await invoke<unknown>('sync_server_get', { id: keys.id });
    if (!there) {
      await invoke('sync_server_forget');
      throw new Error('no-such-code');
    }
  }
  serverKeys = keys;
  serverVersion = 0;
  await kvSet(MODE_KEY, 'server');
  await kvSet(SERVER_KEY, base);
  await kvDel(FOLDER_KEY);
  await kvDel(ACCOUNT_KEY);
  lastStamp = null;
  useSync.setState({
    mode: 'server',
    folder: null,
    git: false,
    account: null,
    serverUrl: base,
    status: 'idle',
    error: null,
    signIn: null,
    shownCode: given === null ? formatCode(code) : null,
  });
  await syncNow();
}

/** Show this computer's sync code again (to type it on another computer). */
export async function showSyncCode(): Promise<void> {
  const url = useSync.getState().serverUrl;
  if (!url) return;
  const code = await invoke<string>('sync_server_use', { url, code: null });
  useSync.setState({ shownCode: formatCode(code) });
}

export const hideSyncCode = (): void => {
  useSync.setState({ shownCode: null });
};

export async function stopSyncing(): Promise<void> {
  const wasGithub = useSync.getState().mode === 'github';
  const wasServer = useSync.getState().mode === 'server';
  await invoke('sync_set_folder', { path: null });
  if (wasGithub) await invoke('sync_github_sign_out');
  if (wasServer) {
    await invoke('sync_server_forget');
    serverKeys = null;
    await kvDel(SERVER_KEY);
  }
  await kvDel(FOLDER_KEY);
  await kvDel(MODE_KEY);
  await kvDel(ACCOUNT_KEY);
  await kvDel(LAST_KEY);
  useSync.setState({
    mode: 'off',
    folder: null,
    git: false,
    account: null,
    status: 'off',
    error: null,
    lastAt: null,
    shownCode: null,
  });
}

let cancelSignIn: (() => void) | null = null;

/**
 * Sign in to GitHub the way a TV app does: GitHub gives a short code, the person types it at
 * github.com/login/device (opened for them) and says yes, and this asks every few seconds whether
 * they have. Melodesk never sees a password.
 */
export async function signInToGithub(): Promise<void> {
  cancelSignIn?.();
  let cancelled = false;
  cancelSignIn = () => {
    cancelled = true;
  };
  useSync.setState({ signIn: { state: 'starting' } });
  try {
    const start = await invoke<{
      userCode: string;
      verificationUri: string;
      interval: number;
      expiresIn: number;
    }>('sync_github_start');
    if (cancelled) return;
    useSync.setState({
      signIn: { state: 'waiting', code: start.userCode, uri: start.verificationUri },
    });
    void openUrl(start.verificationUri).catch(() => undefined);
    let wait = start.interval;
    const until = Date.now() + start.expiresIn * 1000;
    while (!cancelled && Date.now() < until) {
      await new Promise((r) => window.setTimeout(r, wait * 1000));
      if (cancelled) return;
      const res = await invoke<{ status: string; login: string | null }>('sync_github_poll');
      if (res.status === 'slow') wait += 5;
      if (res.status === 'denied' || res.status === 'expired') {
        useSync.setState({ signIn: { state: res.status } });
        return;
      }
      if (res.status === 'done') {
        await kvSet(MODE_KEY, 'github');
        await kvDel(FOLDER_KEY);
        if (res.login) await kvSet(ACCOUNT_KEY, res.login);
        lastStamp = null;
        useSync.setState({
          mode: 'github',
          folder: null,
          git: false,
          account: res.login,
          status: 'idle',
          error: null,
          signIn: null,
        });
        await syncNow();
        return;
      }
    }
    if (!cancelled) useSync.setState({ signIn: { state: 'expired' } });
  } catch (err) {
    if (!cancelled)
      useSync.setState({
        signIn: { state: 'error', error: err instanceof Error ? err.message : String(err) },
      });
  }
}

export function cancelGithubSignIn(): void {
  cancelSignIn?.();
  cancelSignIn = null;
  useSync.setState({ signIn: null });
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
    if (useSync.getState().mode === 'off') return;
    void currentStamp()
      .then((stamp) => {
        if (stamp !== lastStamp) void syncNow();
      })
      .catch(() => undefined);
  }, CHECK_EVERY_MS);
  void (async () => {
    // What this computer can offer, whether or not it is syncing yet.
    const clouds = await invoke<CloudOption[]>('sync_cloud_options').catch(() => []);
    const githubAvailable = await invoke<boolean>('sync_github_available').catch(() => false);
    const serverDefault = await invoke<string | null>('sync_server_default').catch(() => null);
    const serverUrl = await kvGet(SERVER_KEY).catch(() => null);
    if (run.stopped) return;
    useSync.setState({
      clouds,
      githubAvailable,
      serverDefault,
      serverUrl: serverUrl ?? serverDefault,
    });
    const folder = await kvGet(FOLDER_KEY).catch(() => null);
    const saved = await kvGet(MODE_KEY).catch(() => null);
    const account = await kvGet(ACCOUNT_KEY).catch(() => null);
    const last = await kvGet(LAST_KEY).catch(() => null);
    if (run.stopped) return;
    // Saved before there were modes: a folder, if there is one.
    const mode: SyncMode =
      saved === 'server' && serverUrl
        ? 'server'
        : saved === 'github'
          ? 'github'
          : folder
            ? 'folder'
            : 'off';
    if (mode === 'off') {
      useSync.setState({ loaded: true });
      return;
    }
    useSync.setState({
      mode,
      folder,
      account,
      lastAt: last ? Number(last) : null,
      status: 'idle',
      loaded: true,
    });
    try {
      if (mode === 'server' && serverUrl) {
        const code = await invoke<string>('sync_server_use', { url: serverUrl, code: null });
        serverKeys = await deriveKeys(code);
      } else if (mode === 'github') {
        const signedIn = await invoke<boolean>('sync_github_resume');
        if (!signedIn) throw new Error('github-signed-out');
      } else {
        const chosen = await invoke<Chosen | null>('sync_set_folder', { path: folder });
        useSync.setState({ git: chosen?.git ?? false });
      }
    } catch (err) {
      // The folder is gone (a drive that is not plugged in, a cloud folder that was moved), or the
      // GitHub sign-in was taken back.
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
    cancelGithubSignIn();
  };
}
