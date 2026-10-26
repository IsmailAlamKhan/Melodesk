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

export const respond = (request: Request): Promise<Response> => handle(request, theStore());
