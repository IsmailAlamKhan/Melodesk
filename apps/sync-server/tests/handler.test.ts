import { describe, expect, it } from 'vitest';
import { MAX_BYTES, handle } from '../src/handler';
import { memoryStore, upstashStore, type Store } from '../src/store';
import { respond, type NodeRequest, type NodeResponse } from '../src/vercel';

const ID = 'a'.repeat(64);
const url = (path: string): string => `https://sync.example.com${path}`;
const put = (path: string, body: unknown): Request =>
  new Request(url(path), { method: 'PUT', body: JSON.stringify(body) });

describe('the sync server', () => {
  it('answers a health check, with or without Vercel’s /api in front', async () => {
    const store = memoryStore();
    for (const path of ['/v1/health', '/api/v1/health']) {
      const res = await handle(new Request(url(path)), store);
      expect(await res.json()).toEqual({ ok: true, name: 'melodesk-sync', protocol: 1 });
    }
  });

  it('has nothing until something is saved, then gives it back with its version', async () => {
    const store = memoryStore();
    expect((await handle(new Request(url(`/v1/blob/${ID}`)), store)).status).toBe(404);
    const saved = await handle(put(`/api/v1/blob/${ID}`, { data: 'cipher-1' }), store);
    expect(await saved.json()).toEqual({ version: 1 });
    const read = await handle(new Request(url(`/api/v1/blob/${ID}`)), store);
    expect(await read.json()).toEqual({ version: 1, data: 'cipher-1' });
    expect(read.headers.get('cache-control')).toBe('no-store');
    const head = await handle(new Request(url(`/v1/blob/${ID}`), { method: 'HEAD' }), store);
    expect(head.headers.get('x-version')).toBe('1');
  });

  it('refuses a write made from an out-of-date copy, and says where things stand', async () => {
    const store = memoryStore();
    await handle(put(`/v1/blob/${ID}`, { data: 'one', ifVersion: 0 }), store);
    await handle(put(`/v1/blob/${ID}`, { data: 'two', ifVersion: 1 }), store);
    const stale = await handle(put(`/v1/blob/${ID}`, { data: 'late', ifVersion: 1 }), store);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ version: 2 });
    expect((await store.get(ID))?.data).toBe('two');
    // Without ifVersion the write goes through (a first write, or when overwriting is wanted).
    expect((await handle(put(`/v1/blob/${ID}`, { data: 'three' }), store)).status).toBe(200);
  });

  it('keeps each id apart', async () => {
    const store = memoryStore();
    await handle(put(`/v1/blob/${ID}`, { data: 'mine' }), store);
    const other = 'b'.repeat(64);
    expect((await handle(new Request(url(`/v1/blob/${other}`)), store)).status).toBe(404);
  });

  it('turns away what is not a proper request', async () => {
    const store = memoryStore();
    expect((await handle(new Request(url('/v1/blob/short')), store)).status).toBe(400);
    expect((await handle(new Request(url('/elsewhere')), store)).status).toBe(404);
    expect(
      (await handle(new Request(url(`/v1/blob/${ID}`), { method: 'DELETE' }), store)).status,
    ).toBe(405);
    expect(
      (await handle(new Request(url(`/v1/blob/${ID}`), { method: 'PUT', body: 'x' }), store))
        .status,
    ).toBe(400);
    expect((await handle(put(`/v1/blob/${ID}`, { data: 5 }), store)).status).toBe(400);
    expect(
      (await handle(put(`/v1/blob/${ID}`, { data: 'x'.repeat(MAX_BYTES + 1) }), store)).status,
    ).toBe(413);
  });
});

describe('the Redis store', () => {
  it('sends commands to the REST address with the token, and reads the answers', async () => {
    const sent: { command: unknown[]; auth: string | null }[] = [];
    const fake: typeof fetch = (_url, init) => {
      const command = JSON.parse(typeof init?.body === 'string' ? init.body : '[]') as unknown[];
      sent.push({ command, auth: new Headers(init?.headers).get('authorization') });
      const result = command[0] === 'GET' ? JSON.stringify({ v: 4, d: 'cipher' }) : [1, 5];
      return Promise.resolve(new Response(JSON.stringify({ result })));
    };
    const store = upstashStore('https://redis.example.com', 'secret', fake);
    expect(await store.get(ID)).toEqual({ version: 4, data: 'cipher' });
    expect(await store.put(ID, 'new', 4)).toEqual({ ok: true, version: 5 });
    expect(sent[0]?.auth).toBe('Bearer secret');
    expect(sent[0]?.command).toEqual(['GET', `melodesk:sync:${ID}`]);
    expect(sent[1]?.command.slice(0, 2)).toEqual([
      'EVAL',
      expect.stringContaining('cjson') as string,
    ]);
    expect(sent[1]?.command.slice(2, 6)).toEqual([1, `melodesk:sync:${ID}`, 4, 'new']);
  });

  it('says a write was refused, and a missing blob is nothing', async () => {
    const fake: typeof fetch = (_url, init) => {
      const command = JSON.parse(typeof init?.body === 'string' ? init.body : '[]') as unknown[];
      return Promise.resolve(
        new Response(JSON.stringify({ result: command[0] === 'GET' ? null : [0, 7] })),
      );
    };
    const store = upstashStore('https://redis.example.com', 't', fake);
    expect(await store.get(ID)).toBeNull();
    expect(await store.put(ID, 'x', 3)).toEqual({ ok: false, version: 7 });
  });

  it('fails loudly when storage is down', async () => {
    const down: typeof fetch = () => Promise.resolve(new Response('no', { status: 500 }));
    await expect(upstashStore('https://r', 't', down).get(ID)).rejects.toThrow(
      'storage answered 500',
    );
  });
});

describe('Vercel’s classic function style', () => {
  const run = async (
    req: Partial<NodeRequest> & { url: string },
    store: Store,
  ): Promise<{ status: number; body: string; headers: Record<string, string> }> => {
    const headers: Record<string, string> = {};
    let body = '';
    const res: NodeResponse = {
      statusCode: 0,
      setHeader: (n, v) => {
        headers[n.toLowerCase()] = v;
      },
      end: (b) => {
        body = b ?? '';
      },
    };
    await respond({ method: 'GET', headers: { host: 'sync.example.com' }, ...req }, res, store);
    return { status: res.statusCode, body, headers };
  };

  it('answers the health check', async () => {
    const out = await run({ url: '/api/v1/health' }, memoryStore());
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body)).toMatchObject({ name: 'melodesk-sync' });
  });

  it('saves and reads back, with the body Vercel has already parsed', async () => {
    const store = memoryStore();
    const saved = await run(
      { method: 'PUT', url: `/api/v1/blob/${ID}`, body: { data: 'cipher', ifVersion: 0 } },
      store,
    );
    expect(JSON.parse(saved.body)).toEqual({ version: 1 });
    const read = await run({ url: `/api/v1/blob/${ID}` }, store);
    expect(JSON.parse(read.body)).toEqual({ version: 1, data: 'cipher' });
    // A body that arrives as text is passed on as it is.
    const again = await run(
      {
        method: 'PUT',
        url: `/api/v1/blob/${ID}`,
        body: JSON.stringify({ data: 'two', ifVersion: 1 }),
      },
      store,
    );
    expect(JSON.parse(again.body)).toEqual({ version: 2 });
  });

  it('says a refused write is a conflict, and a head request has no body', async () => {
    const store = memoryStore();
    await run({ method: 'PUT', url: `/api/v1/blob/${ID}`, body: { data: 'one' } }, store);
    const stale = await run(
      { method: 'PUT', url: `/api/v1/blob/${ID}`, body: { data: 'x', ifVersion: 0 } },
      store,
    );
    expect(stale.status).toBe(409);
    const head = await run({ method: 'HEAD', url: `/api/v1/blob/${ID}` }, store);
    expect(head.status).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers['x-version']).toBe('1');
  });

  it('turns a storage failure into an answer instead of a crash', async () => {
    const broken: Store = {
      get: () => Promise.reject(new Error('down')),
      put: () => Promise.reject(new Error('down')),
    };
    expect((await run({ url: `/api/v1/blob/${ID}` }, broken)).status).toBe(502);
  });
});
