import { create } from 'zustand';

/**
 * Named actions: how one feature asks for something another feature provides, without importing
 * it. A feature registers `nowPlaying.open` while it is active; anyone may `runAction` it, and it
 * simply does nothing (returning false) when the feature is off. `useHasAction` lets a button hide
 * itself when nothing would answer.
 */
const handlers = new Map<string, () => void>();
const useRegistered = create<{ ids: string[] }>(() => ({ ids: [] }));

export function registerAction(id: string, run: () => void): () => void {
  handlers.set(id, run);
  useRegistered.setState((s) => ({ ids: s.ids.includes(id) ? s.ids : [...s.ids, id] }));
  return () => {
    if (handlers.get(id) !== run) return;
    handlers.delete(id);
    useRegistered.setState((s) => ({ ids: s.ids.filter((x) => x !== id) }));
  };
}

export function runAction(id: string): boolean {
  const run = handlers.get(id);
  if (!run) return false;
  run();
  return true;
}

export function useHasAction(id: string): boolean {
  return useRegistered((s) => s.ids.includes(id));
}
