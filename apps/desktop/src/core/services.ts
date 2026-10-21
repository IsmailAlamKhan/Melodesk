import type { LyricsResult, PluginTrack } from '@melodesk/plugins';
import { create } from 'zustand';

/** A small registry of things features offer to each other, with change notifications for React. */
export function createRegistry<T extends { id: string }>() {
  const useStore = create<{ items: T[] }>(() => ({ items: [] }));
  return {
    register(item: T): () => void {
      useStore.setState((s) => ({ items: [...s.items.filter((i) => i.id !== item.id), item] }));
      return () => {
        useStore.setState((s) => ({ items: s.items.filter((i) => i !== item) }));
      };
    },
    all: (): T[] => useStore.getState().items,
    useAll: (): T[] => useStore((s) => s.items),
  };
}

/** Somewhere timed lyrics can come from, such as an opt-in LRCLIB plugin. */
export interface LyricsSource {
  id: string;
  label: string;
  /** Whether the user has turned this source on. */
  isActive: () => boolean;
  /** Be told when that changes (returns an unsubscribe), so views can follow it. */
  subscribe: (onChange: () => void) => () => void;
  /** Turn it on (the lyrics view offers this when the lyrics it has are not timed). */
  activate: () => void;
  fetch: (track: PluginTrack) => Promise<LyricsResult | null>;
}

export const lyricsSources = createRegistry<LyricsSource>();
