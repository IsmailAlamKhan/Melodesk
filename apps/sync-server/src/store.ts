/** One saved blob and how many times it has been written. */
export interface Stored {
  version: number;
  data: string;
}

export type PutResult = { ok: true; version: number } | { ok: false; version: number };

/** Where blobs are kept. The server never looks inside one. */
export interface Store {
  get: (id: string) => Promise<Stored | null>;
  /**
   * Save `data`. With `expected` set, only if the blob is at that version (0 = not there yet), so two
   * computers writing at once cannot silently overwrite each other.
   */
  put: (id: string, data: string, expected: number | null) => Promise<PutResult>;
}

/** For tests, and for running the handler somewhere without a database. */
export function memoryStore(): Store {
  const blobs = new Map<string, Stored>();
  return {
    get: (id) => Promise.resolve(blobs.get(id) ?? null),
    put: (id, data, expected) => {
      const current = blobs.get(id)?.version ?? 0;
      if (expected !== null && expected !== current)
        return Promise.resolve({ ok: false, version: current });
      blobs.set(id, { version: current + 1, data });
      return Promise.resolve({ ok: true, version: current + 1 });
    },
  };
}

/** A blob nobody writes to for this long is dropped (every write starts the time again). */
export const KEEP_SECONDS = 400 * 24 * 60 * 60;

/**
 * Upstash Redis through its REST API (what Vercel's Redis storage is), with plain `fetch`: nothing to
 * install. The compare-and-swap is one Lua script, so it is atomic.
 */
export function upstashStore(url: string, token: string, fetcher: typeof fetch = fetch): Store {
  const call = async (command: (string | number)[]): Promise<unknown> => {
    const res = await fetcher(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!res.ok) throw new Error(`storage answered ${String(res.status)}`);
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (body.error) throw new Error(body.error);
    return body.result;
  };
  const key = (id: string): string => `melodesk:sync:${id}`;
  const SCRIPT = `
local cur = redis.call('GET', KEYS[1])
local ver = 0
if cur then ver = cjson.decode(cur).v end
local expected = tonumber(ARGV[1])
if expected >= 0 and expected ~= ver then return {0, ver} end
local nv = ver + 1
redis.call('SET', KEYS[1], cjson.encode({v = nv, d = ARGV[2]}), 'EX', ARGV[3])
return {1, nv}`;
  return {
    get: async (id) => {
      const raw = await call(['GET', key(id)]);
      if (typeof raw !== 'string') return null;
      const parsed = JSON.parse(raw) as { v?: number; d?: string };
      return typeof parsed.v === 'number' && typeof parsed.d === 'string'
        ? { version: parsed.v, data: parsed.d }
        : null;
    },
    put: async (id, data, expected) => {
      const out = (await call([
        'EVAL',
        SCRIPT,
        1,
        key(id),
        expected ?? -1,
        data,
        KEEP_SECONDS,
      ])) as [number, number];
      return { ok: out[0] === 1, version: out[1] };
    },
  };
}
