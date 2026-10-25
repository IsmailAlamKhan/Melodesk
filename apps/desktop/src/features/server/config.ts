import { create } from 'zustand';
import { kvGet, kvSet } from '../../data/kv';
import { allowHosts } from '../../net/allow';
import { baseUrl, type ServerConfig } from './subsonic';

const KEY = 'server:config';

interface Store {
  loaded: boolean;
  config: ServerConfig | null;
}

export const useServer = create<Store>(() => ({ loaded: false, config: null }));

function valid(c: unknown): c is ServerConfig {
  const o = (c ?? {}) as Partial<ServerConfig>;
  return (
    typeof o.url === 'string' &&
    typeof o.user === 'string' &&
    typeof o.password === 'string' &&
    !!o.url
  );
}

/** The saved server, and the permission to reach its host. */
export async function loadServer(): Promise<void> {
  try {
    const raw = await kvGet(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    const config = valid(parsed) ? parsed : null;
    useServer.setState({ loaded: true, config });
    await allowHosts('server', config ? [baseUrl(config.url)] : []);
  } catch {
    useServer.setState({ loaded: true });
  }
}

export async function saveServer(config: ServerConfig | null): Promise<void> {
  const clean = config ? { ...config, url: baseUrl(config.url) } : null;
  // Fetching is only allowed from the hosts the user added, so the host goes first.
  await allowHosts('server', clean ? [clean.url] : []);
  await kvSet(KEY, clean ? JSON.stringify(clean) : '');
  useServer.setState({ loaded: true, config: clean });
}
