import type { Store } from './store.js';

/** The biggest blob accepted: a settings file is a few kilobytes; this is only a safety limit. */
export const MAX_BYTES = 1_000_000;

const ID = /^[a-f0-9]{64}$/u;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

/**
 * Melodesk's settings sync server, as a plain `Request` -> `Response` function (it runs on Vercel,
 * Cloudflare, Deno, Bun or Node alike). It stores opaque text under an id and tells nothing else: the
 * app encrypts everything before it is sent, and the id is a hash of a code only the person's own
 * computers know, so the server has no accounts, no names and nothing it could read.
 *
 *   GET  /v1/health
 *   GET  /v1/blob/:id          -> { version, data }  (404 if there is none yet)
 *   HEAD /v1/blob/:id          -> x-version header
 *   PUT  /v1/blob/:id  { data, ifVersion? } -> { version }  (409 { version } if it moved on)
 *
 * A leading `/api` is accepted too (Vercel puts functions under it).
 */
export async function handle(request: Request, store: Store): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api(?=\/)/u, '').replace(/\/+$/u, '');
  if (path === '/v1/health') {
    return request.method === 'GET'
      ? json({ ok: true, name: 'melodesk-sync', protocol: 1 })
      : json({ error: 'method not allowed' }, 405);
  }
  const m = /^\/v1\/blob\/([^/]+)$/u.exec(path);
  if (!m) return json({ error: 'not found' }, 404);
  const id = m[1] ?? '';
  if (!ID.test(id)) return json({ error: 'bad id' }, 400);

  if (request.method === 'GET' || request.method === 'HEAD') {
    const found = await store.get(id);
    if (!found) return json({ error: 'not found' }, 404);
    if (request.method === 'HEAD')
      return new Response(null, {
        status: 200,
        headers: { 'x-version': String(found.version), 'cache-control': 'no-store' },
      });
    return json({ version: found.version, data: found.data });
  }

  if (request.method === 'PUT') {
    const text = await request.text();
    if (text.length > MAX_BYTES + 1000) return json({ error: 'too big' }, 413);
    let body: { data?: unknown; ifVersion?: unknown };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      return json({ error: 'not json' }, 400);
    }
    if (typeof body.data !== 'string') return json({ error: 'bad data' }, 400);
    if (body.data.length > MAX_BYTES) return json({ error: 'too big' }, 413);
    const expected =
      typeof body.ifVersion === 'number' && Number.isInteger(body.ifVersion) && body.ifVersion >= 0
        ? body.ifVersion
        : null;
    const saved = await store.put(id, body.data, expected);
    return saved.ok ? json({ version: saved.version }) : json({ version: saved.version }, 409);
  }

  return json({ error: 'method not allowed' }, 405);
}
