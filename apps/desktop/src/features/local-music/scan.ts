import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { create } from 'zustand';
import { kvGet, kvSet } from '../../data/kv';
import { queryClient } from '../../data/queryClient';
import {
  clearLibrary,
  knownFiles,
  removeMissing,
  upsertTracks,
  type ScannedTrack,
} from './library';

const FOLDERS_KEY = 'local:folders';

export async function loadFolders(): Promise<string[]> {
  try {
    const raw = await kvGet(FOLDERS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((f): f is string => typeof f === 'string') : [];
  } catch {
    return [];
  }
}

export async function saveFolders(folders: readonly string[]): Promise<void> {
  await kvSet(FOLDERS_KEY, JSON.stringify(folders));
  void queryClient.invalidateQueries({ queryKey: ['local', 'folders'] });
}

/** Whether `folder` is `other` or inside it (so adding it would add nothing). */
export const isInside = (folder: string, other: string): boolean => {
  const norm = (p: string): string => p.replace(/[\\/]+$/u, '');
  const f = norm(folder);
  const o = norm(other);
  return f === o || f.startsWith(`${o}/`) || f.startsWith(`${o}\\`);
};

/** Let the user pick a folder and add it to the library, then read it. Returns false if none was chosen. */
export async function addFolder(): Promise<boolean> {
  const picked = await open({ directory: true, multiple: false });
  if (typeof picked !== 'string') return false;
  const folders = await loadFolders();
  if (folders.some((f) => isInside(picked, f))) return false;
  // A folder that contains ones already added replaces them.
  await saveFolders([...folders.filter((f) => !isInside(f, picked)), picked]);
  void rescan();
  return true;
}

export async function removeFolder(folder: string): Promise<void> {
  const rest = (await loadFolders()).filter((f) => f !== folder);
  await saveFolders(rest);
  await rescan();
}

export interface ScanStatus {
  running: boolean;
  /** Audio files seen so far. */
  found: number;
  /** New or changed ones read so far. */
  added: number;
  failed: number;
  error: string | null;
  finishedAt: number | null;
}

export const useScanStatus = create<ScanStatus>(() => ({
  running: false,
  found: 0,
  added: 0,
  failed: 0,
  error: null,
  finishedAt: null,
}));

let running: Promise<void> | null = null;

/** Read the library folders: new and changed files are indexed, and files that are gone are forgotten. */
export function rescan(): Promise<void> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<void> {
  const status = useScanStatus;
  const folders = await loadFolders();
  if (folders.length === 0) {
    await clearLibrary();
    status.setState({ running: false, found: 0, added: 0, failed: 0, error: null });
    void queryClient.invalidateQueries({ queryKey: ['local'] });
    return;
  }
  status.setState({ running: true, found: 0, added: 0, failed: 0, error: null });
  // Batches arrive while the walk goes on; they are written one after the other, and the walk is
  // only called finished once the last is in.
  let writes: Promise<void> = Promise.resolve();
  const offBatch = await listen<ScannedTrack[]>('local:scan-batch', (e) => {
    const batch = e.payload;
    writes = writes
      .then(() => upsertTracks(batch))
      .then(() => {
        status.setState((s) => ({ added: s.added + batch.length }));
        void queryClient.invalidateQueries({ queryKey: ['local'] });
      });
  });
  const offProgress = await listen<number>('local:scan-progress', (e) => {
    status.setState({ found: e.payload });
  });
  try {
    const known = await knownFiles();
    const summary = await invoke<{ seen: string[]; added: number; failed: number }>('local_scan', {
      roots: folders,
      known,
    });
    await writes;
    await removeMissing(summary.seen);
    status.setState({ found: summary.seen.length, failed: summary.failed });
  } catch (err) {
    status.setState({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    offBatch();
    offProgress();
    status.setState({ running: false, finishedAt: Date.now() });
    void queryClient.invalidateQueries({ queryKey: ['local'] });
  }
}
