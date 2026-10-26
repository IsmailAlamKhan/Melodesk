import type { LyricsResult, NewRelease, PluginTrack, SongInfo } from '@melodesk/plugins';
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
  /**
   * A short text that changes when what the source would answer changes (which plugins are on), so
   * lyrics looked up before that are looked up again.
   */
  signature?: () => string;
  /** False while the source is still starting up, when what it would answer is not known yet. */
  ready?: () => boolean;
  /** Whether something can explain a line of the lyrics (a plugin with an AI model, switched on). */
  canExplain?: () => boolean;
  /** An explanation of `line` in plain words, or null when none could be made. */
  explain?: (track: PluginTrack, line: string, context: string[]) => Promise<string | null>;
  /** Turn it on (the lyrics view offers this when the lyrics it has are not timed). */
  activate: () => void;
  fetch: (track: PluginTrack) => Promise<LyricsResult | null>;
}

export const lyricsSources = createRegistry<LyricsSource>();

/** Somewhere facts about songs and artists, and new releases, can come from (an opt-in plugin). */
export interface InfoSource {
  id: string;
  label: string;
  isActive: () => boolean;
  subscribe: (onChange: () => void) => () => void;
  /** Turn it on (the views that use it offer this before anything is sent). */
  activate: () => void;
  songInfo: (track: PluginTrack) => Promise<SongInfo | null>;
  newReleases: (artists: string[], days: number) => Promise<NewRelease[]>;
}

export const infoSources = createRegistry<InfoSource>();

/** An AI helper the app can ask to do small jobs (a model on this computer, switched on by the user). */
export interface AiSource {
  id: string;
  label: string;
  isActive: () => boolean;
  subscribe: (onChange: () => void) => () => void;
  /** Filter rules for a playlist described in words, as untrusted JSON (null when it could not be made). */
  suggestRules: (description: string) => Promise<unknown>;
}

export const aiSources = createRegistry<AiSource>();
