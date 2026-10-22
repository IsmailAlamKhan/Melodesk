import { kvDel, kvGet, kvSet } from '../../data/kv';

/** What is needed to pick up where the listener left off. */
export interface SavedListen {
  videoId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  /** Where in the song, in seconds. */
  position: number;
  duration: number;
  /** The page's own endpoint for this item, so it resumes inside the same playlist or radio. */
  endpoint: Record<string, unknown> | null;
  savedAt: number;
}

const KEY = 'resume:last';

/** Songs this short into them are not worth returning to; nor are ones that have just ended. */
export function worthResuming(position: number, duration: number): boolean {
  if (!(duration > 0)) return position >= 10;
  return position >= 10 && position <= duration - 10;
}

export async function loadSaved(): Promise<SavedListen | null> {
  try {
    const raw = await kvGet(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<SavedListen>;
    if (typeof o.videoId !== 'string' || typeof o.title !== 'string') return null;
    return {
      videoId: o.videoId,
      title: o.title,
      artist: typeof o.artist === 'string' ? o.artist : '',
      artworkUrl: typeof o.artworkUrl === 'string' ? o.artworkUrl : null,
      position: typeof o.position === 'number' ? o.position : 0,
      duration: typeof o.duration === 'number' ? o.duration : 0,
      endpoint: typeof o.endpoint === 'object' ? o.endpoint : null,
      savedAt: typeof o.savedAt === 'number' ? o.savedAt : 0,
    };
  } catch {
    return null;
  }
}

export async function save(value: SavedListen): Promise<void> {
  await kvSet(KEY, JSON.stringify(value));
}

export async function forget(): Promise<void> {
  await kvDel(KEY);
}

/** The song a navigation endpoint would play, if it says. */
export function endpointVideoId(endpoint: Record<string, unknown> | null): string | null {
  const watch = endpoint?.['watchEndpoint'];
  if (typeof watch !== 'object' || watch === null) return null;
  const id = (watch as Record<string, unknown>)['videoId'];
  return typeof id === 'string' ? id : null;
}

/**
 * The endpoint that plays `videoId` inside its playlist or radio, taken from the queue item that is
 * that very song. The queue's current index can lag behind the track, so it is not trusted: an
 * endpoint of another song would resume the wrong one.
 */
export function endpointFor(
  videoId: string,
  queue: {
    items: readonly { videoId: string; endpoint: Record<string, unknown> | null }[];
    index: number;
  } | null,
): Record<string, unknown> | null {
  if (!queue) return null;
  const at = queue.items[queue.index];
  const item = at?.videoId === videoId ? at : queue.items.find((i) => i.videoId === videoId);
  return item && endpointVideoId(item.endpoint) === videoId ? item.endpoint : null;
}
