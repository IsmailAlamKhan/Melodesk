import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

/** Covers of local songs: read from the file (or its folder) once, shrunk, and kept as blob URLs. */

const MAX_SIDE = 640;
const KEEP = 400;
const PARALLEL = 3;

const done = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
const queue: (() => void)[] = [];
let running = 0;

function sniff(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return 'image/webp';
  return 'image/jpeg';
}

/** A smaller copy: covers are often 3000 px wide and a list shows dozens of them. */
async function shrink(blob: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && blob.size < 300_000) {
      bitmap.close();
      return blob;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const small = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.88),
    );
    return small ?? blob;
  } catch {
    return blob;
  }
}

async function load(path: string): Promise<string | null> {
  const buffer = await invoke<ArrayBuffer>('local_artwork', { path });
  if (buffer.byteLength === 0) return null;
  const bytes = new Uint8Array(buffer);
  const blob = await shrink(new Blob([bytes], { type: sniff(bytes) }));
  return URL.createObjectURL(blob);
}

function schedule<T>(work: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = (): void => {
      running += 1;
      work()
        .then(resolve, reject)
        .finally(() => {
          running -= 1;
          queue.shift()?.();
        });
    };
    if (running < PARALLEL) run();
    else queue.push(run);
  });
}

/** The cover of a library file as an image URL, or null when it has none. */
export function getCover(path: string): Promise<string | null> {
  if (done.has(path)) return Promise.resolve(done.get(path) ?? null);
  const inFlight = pending.get(path);
  if (inFlight) return inFlight;
  const p = schedule(() => load(path))
    .catch(() => null)
    .then((url) => {
      pending.delete(path);
      done.set(path, url);
      // The oldest are forgotten once there are many; the page showing one keeps its own copy alive
      // only until it is revoked, so this is generous.
      if (done.size > KEEP) {
        const oldest = done.keys().next().value;
        if (oldest !== undefined) {
          const url = done.get(oldest);
          done.delete(oldest);
          if (url) URL.revokeObjectURL(url);
        }
      }
      return url;
    });
  pending.set(path, p);
  return p;
}

/** The cover for a song file as it becomes available; undefined while loading, null if none. */
export function useLocalCover(path: string | null | undefined): string | null | undefined {
  const [state, setState] = useState<{ path: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    void getCover(path).then((url) => {
      if (live) setState({ path, url });
    });
    return () => {
      live = false;
    };
  }, [path]);
  if (!path) return null;
  return state?.path === path ? state.url : (done.get(path) ?? undefined);
}
