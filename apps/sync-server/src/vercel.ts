import { handle } from './handler';
import { memoryStore, upstashStore, type Store } from './store';

let store: Store | null = null;

/** The database from the environment Vercel sets up when Redis storage is added to the project. */
function theStore(): Store {
  if (store) return store;
  const url = process.env['UPSTASH_REDIS_REST_URL'] ?? process.env['KV_REST_API_URL'];
  const token = process.env['UPSTASH_REDIS_REST_TOKEN'] ?? process.env['KV_REST_API_TOKEN'];
  // Without storage the server still answers (so the health check works), but forgets on restart.
  store = url && token ? upstashStore(url, token) : memoryStore();
  return store;
}

/** The little of Node's request and response that Vercel's classic function style gives us. */
export interface NodeRequest {
  method?: string | undefined;
  url?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  /** Vercel has parsed a JSON body already. */
  body?: unknown;
}
export interface NodeResponse {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
}

/** Turn a classic `(req, res)` call into a `Request`, run the handler, and write the `Response` back. */
export async function respond(
  req: NodeRequest,
  res: NodeResponse,
  useStore: Store = theStore(),
): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase();
  const host = [req.headers['host']].flat()[0] ?? 'localhost';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = !hasBody
    ? undefined
    : typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body ?? {});
  const request = new Request(`https://${host}${req.url ?? '/'}`, {
    method,
    ...(body === undefined ? {} : { body }),
  });
  let answer: Response;
  try {
    answer = await handle(request, useStore);
  } catch {
    answer = new Response(JSON.stringify({ error: 'storage unavailable' }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
  res.statusCode = answer.status;
  answer.headers.forEach((value, name) => {
    res.setHeader(name, value);
  });
  res.end(method === 'HEAD' ? undefined : await answer.text());
}

export default function handler(req: NodeRequest, res: NodeResponse): Promise<void> {
  return respond(req, res);
}
