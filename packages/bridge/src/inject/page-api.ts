/**
 * Access to the YouTube Music page's own internals, feature-detected and versioned alongside
 * the selectors. Everything here is best-effort: a YouTube deploy can remove any of it, and
 * the bridge reports what it found via the `capabilities` event instead of crashing.
 *
 * We deliberately use the page's network manager for InnerTube requests. It attaches the
 * page's own auth headers and context, so our code never reads cookies or tokens.
 */

interface NetworkManager {
  fetch: (path: string, body: Record<string, unknown>) => Promise<unknown>;
}

export interface ReduxStore {
  getState: () => unknown;
  dispatch: (action: unknown) => unknown;
  subscribe: (listener: () => void) => () => void;
}

export interface QueueApi {
  getItems?: () => unknown[];
  getCurrentItemIndex?: () => number;
  selectQueueItem?: (index: number) => unknown;
  removeItem?: (index: number) => unknown;
  shuffle?: () => unknown;
  store?: { store?: ReduxStore };
}

export interface YtMusicApp extends HTMLElement {
  networkManager?: NetworkManager;
  navigate?: (target: unknown, ...rest: unknown[]) => unknown;
  navigate_?: (target: unknown) => unknown;
  handleNavigationEndpoint?: (...args: unknown[]) => unknown;
  handleServiceEndpoint?: (...args: unknown[]) => unknown;
  navigator?: unknown;
  serviceEndpointHandlers?: Record<string, unknown>;
  queue?: QueueApi;
  store?: ReduxStore;
  getState?: () => unknown;
}

export interface PlayerBar extends HTMLElement {
  shuffleOn?: boolean;
  repeatMode?: string;
  onShuffleButtonClick?: () => void;
  onRepeatButtonClick?: () => void;
  queue?: QueueApi;
}

export function getPlayerBar(): PlayerBar | null {
  return document.querySelector<PlayerBar>('ytmusic-player-bar');
}

export function getQueueApi(): QueueApi | null {
  return (
    getApp()?.queue ??
    getPlayerBar()?.queue ??
    (document.querySelector('ytmusic-player-queue') as { queue?: QueueApi } | null)?.queue ??
    null
  );
}

export function getStore(): ReduxStore | null {
  const s = getQueueApi()?.store?.store ?? getApp()?.store;
  return s && typeof s.getState === 'function' && typeof s.subscribe === 'function' ? s : null;
}

export function getApp(): YtMusicApp | null {
  return document.querySelector<YtMusicApp>('ytmusic-app');
}

export function getNetworkManager(): NetworkManager | null {
  const nm = getApp()?.networkManager;
  return nm && typeof nm.fetch === 'function' ? nm : null;
}

/** Collect function names on an object and its prototype chain (depth-limited), for probing. */
export function methodNames(obj: unknown, depth = 3): string[] {
  const names = new Set<string>();
  let cur: unknown = obj;
  let d = 0;
  while (cur && cur !== Object.prototype && cur !== HTMLElement.prototype && d < depth) {
    for (const key of Object.getOwnPropertyNames(cur)) {
      try {
        if (typeof (cur as Record<string, unknown>)[key] === 'function') names.add(key);
      } catch {
        /* accessor threw */
      }
    }
    cur = Object.getPrototypeOf(cur);
    d += 1;
  }
  return [...names].sort();
}

/** Non-function property names (own + prototype accessors), for discovering Polymer properties. */
export function propNames(obj: unknown, depth = 3): string[] {
  const names = new Set<string>();
  let cur: unknown = obj;
  let d = 0;
  while (cur && cur !== Object.prototype && cur !== HTMLElement.prototype && d < depth) {
    for (const key of Object.getOwnPropertyNames(cur)) {
      try {
        if (typeof (cur as Record<string, unknown>)[key] !== 'function') names.add(key);
      } catch {
        /* accessor threw */
      }
    }
    cur = Object.getPrototypeOf(cur);
    d += 1;
  }
  return [...names].sort();
}

export function keyNames(obj: unknown): string[] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj).sort();
}
