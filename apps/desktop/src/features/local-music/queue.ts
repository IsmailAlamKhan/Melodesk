/** The local player's queue: pure functions over a small value, so they can be tested without audio. */

export type Repeat = 'off' | 'all' | 'one';

export interface Queue<T> {
  items: T[];
  /** The song playing now (-1 when the queue is empty). */
  index: number;
  shuffle: boolean;
  repeat: Repeat;
  /** The order before shuffling, to go back to when shuffle is turned off. */
  original: T[] | null;
}

export const emptyQueue = <T>(): Queue<T> => ({
  items: [],
  index: -1,
  shuffle: false,
  repeat: 'off',
  original: null,
});

/** Fisher–Yates, on a copy. */
export function shuffled<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** A new queue of `tracks` starting at `start`; with shuffle, that song first and the rest mixed. */
export function startQueue<T>(
  tracks: readonly T[],
  start: number,
  opts: { shuffle: boolean; repeat: Repeat },
  rng: () => number = Math.random,
): Queue<T> {
  if (tracks.length === 0) return { ...emptyQueue<T>(), ...opts };
  const first = Math.min(Math.max(start, 0), tracks.length - 1);
  if (!opts.shuffle) return { items: [...tracks], index: first, original: null, ...opts };
  const current = tracks[first] as T;
  const rest = tracks.filter((_t, i) => i !== first);
  return {
    items: [current, ...shuffled(rest, rng)],
    index: 0,
    original: [...tracks],
    ...opts,
  };
}

/** Turn shuffle on (the songs after the current one are mixed) or off (the original order returns). */
export function setShuffle<T>(
  q: Queue<T>,
  enabled: boolean,
  rng: () => number = Math.random,
): Queue<T> {
  if (enabled === q.shuffle) return q;
  if (enabled) {
    const upTo = q.items.slice(0, q.index + 1);
    const after = q.items.slice(q.index + 1);
    return {
      ...q,
      shuffle: true,
      original: [...q.items],
      items: [...upTo, ...shuffled(after, rng)],
    };
  }
  const current = q.items[q.index];
  const original = q.original ?? q.items;
  // Songs added while shuffled are not in the original: they go at its end.
  const known = new Set(original);
  const added = q.items.filter((t) => !known.has(t));
  const items = [...original.filter((t) => q.items.includes(t)), ...added];
  const index = current === undefined ? -1 : items.indexOf(current);
  return { ...q, shuffle: false, original: null, items, index };
}

/** The index to play after the current song ends or Next is pressed, or null at the end. */
export function nextIndex<T>(q: Queue<T>): number | null {
  if (q.items.length === 0) return null;
  if (q.index + 1 < q.items.length) return q.index + 1;
  return q.repeat === 'all' ? 0 : null;
}

/**
 * What Previous does: past the first seconds of a song it starts the song again, otherwise it goes
 * back one (and round to the end when repeating all).
 */
export function previousStep<T>(
  q: Queue<T>,
  positionSeconds: number,
): { type: 'restart' } | { type: 'go'; index: number } {
  if (positionSeconds > 3 || q.items.length === 0) return { type: 'restart' };
  if (q.index > 0) return { type: 'go', index: q.index - 1 };
  return q.repeat === 'all' ? { type: 'go', index: q.items.length - 1 } : { type: 'restart' };
}

/** Move a song within the queue, keeping the current song current. */
export function moveItem<T>(q: Queue<T>, from: number, to: number): Queue<T> {
  const n = q.items.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return q;
  const items = [...q.items];
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved as T);
  let index = q.index;
  if (q.index === from) index = to;
  else if (from < q.index && to >= q.index) index -= 1;
  else if (from > q.index && to <= q.index) index += 1;
  return { ...q, items, index };
}

/** Take a song out. `removedCurrent` says the playing song went, so what follows must be started. */
export function removeItem<T>(
  q: Queue<T>,
  at: number,
): { queue: Queue<T>; removedCurrent: boolean } {
  if (at < 0 || at >= q.items.length) return { queue: q, removedCurrent: false };
  const items = q.items.filter((_t, i) => i !== at);
  const original = q.original ? q.original.filter((t) => t !== q.items[at]) : null;
  const removedCurrent = at === q.index;
  let index = q.index;
  if (at < q.index) index -= 1;
  if (removedCurrent && index >= items.length) index = items.length - 1;
  return { queue: { ...q, items, original, index }, removedCurrent };
}

/** Add songs right after the current one, or at the end. */
export function addToQueue<T>(q: Queue<T>, tracks: readonly T[], where: 'next' | 'end'): Queue<T> {
  if (tracks.length === 0) return q;
  if (q.items.length === 0) return { ...q, items: [...tracks], index: 0 };
  const at = where === 'next' ? q.index + 1 : q.items.length;
  const items = [...q.items.slice(0, at), ...tracks, ...q.items.slice(at)];
  const original = q.original ? [...q.original, ...tracks] : null;
  return { ...q, items, original };
}
