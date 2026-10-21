/**
 * Offline artwork cache. Covers are stored as blobs in IndexedDB the first time they load, and
 * served from there when the network copy fails (offline, or a signed URL that expired). The
 * HTTP cache still does the everyday work; this is the safety net, capped and evicted oldest first.
 */

const DB_NAME = 'melodesk-artwork';
const IMAGES = 'images';
const META = 'meta';
export const MAX_CACHE_BYTES = 100 * 1024 * 1024;
const MAX_ITEM_BYTES = 3 * 1024 * 1024;
const CONCURRENCY = 2;
const EVICT_EVERY = 20;

export interface Meta {
  url: string;
  size: number;
  /** Last time it was stored or served. */
  at: number;
}

/** URLs to delete, oldest first, so the rest fits in `maxBytes`. */
export function planEviction(entries: readonly Meta[], maxBytes: number): string[] {
  let total = entries.reduce((n, e) => n + e.size, 0);
  const out: string[] = [];
  for (const e of [...entries].sort((a, b) => a.at - b.at)) {
    if (total <= maxBytes) break;
    out.push(e.url);
    total -= e.size;
  }
  return out;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IMAGES);
      req.result.createObjectStore(META, { keyPath: 'url' });
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      resolve(null);
    };
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      resolve();
    };
    tx.onabort = () => {
      resolve();
    };
  });
}

function result(req: IDBRequest): Promise<unknown> {
  return new Promise((resolve) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      resolve(undefined);
    };
  });
}

/** The stored cover for this URL, or null. Counts as a use, so popular covers outlive old ones. */
export async function getCached(url: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  const tx = db.transaction([IMAGES, META], 'readwrite');
  const blob = (await result(tx.objectStore(IMAGES).get(url))) as Blob | undefined;
  if (blob) {
    const meta = (await result(tx.objectStore(META).get(url))) as Meta | undefined;
    if (meta) tx.objectStore(META).put({ ...meta, at: Date.now() });
  }
  await done(tx);
  return blob ?? null;
}

async function has(url: string): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  const tx = db.transaction(META, 'readonly');
  return (await result(tx.objectStore(META).getKey(url))) !== undefined;
}

export async function cacheStats(): Promise<{ count: number; bytes: number }> {
  const db = await openDb();
  if (!db) return { count: 0, bytes: 0 };
  const all = ((await result(db.transaction(META).objectStore(META).getAll())) ?? []) as Meta[];
  return { count: all.length, bytes: all.reduce((n, e) => n + e.size, 0) };
}

export async function clearArtworkCache(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const tx = db.transaction([IMAGES, META], 'readwrite');
  tx.objectStore(IMAGES).clear();
  tx.objectStore(META).clear();
  known.clear();
  await done(tx);
}

async function evict(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const all = ((await result(db.transaction(META).objectStore(META).getAll())) ?? []) as Meta[];
  const drop = planEviction(all, MAX_CACHE_BYTES);
  if (drop.length === 0) return;
  const tx = db.transaction([IMAGES, META], 'readwrite');
  for (const url of drop) {
    tx.objectStore(IMAGES).delete(url);
    tx.objectStore(META).delete(url);
    known.delete(url);
  }
  await done(tx);
}

const known = new Set<string>();
const queue: string[] = [];
let active = 0;
let stored = 0;

async function store(url: string): Promise<void> {
  try {
    if (await has(url)) return;
    // force-cache: reuse the copy the <img> just downloaded rather than fetching it again.
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
    if (!res.ok) return;
    const blob = await res.blob();
    if (blob.size === 0 || blob.size > MAX_ITEM_BYTES || !blob.type.startsWith('image/')) return;
    const db = await openDb();
    if (!db) return;
    const tx = db.transaction([IMAGES, META], 'readwrite');
    tx.objectStore(IMAGES).put(blob, url);
    tx.objectStore(META).put({ url, size: blob.size, at: Date.now() } satisfies Meta);
    await done(tx);
    stored += 1;
    if (stored % EVICT_EVERY === 0) await evict();
  } catch {
    /* offline, blocked by CORS, or storage full: the cache is best-effort */
  }
}

function pump(): void {
  while (active < CONCURRENCY) {
    const next = queue.shift();
    if (next === undefined) return;
    active += 1;
    void store(next).finally(() => {
      active -= 1;
      pump();
    });
  }
}

/** Keep a copy of this cover for offline use. Cheap to call repeatedly. */
export function remember(url: string): void {
  if (!url.startsWith('https://') || known.has(url)) return;
  known.add(url);
  queue.push(url);
  pump();
}
