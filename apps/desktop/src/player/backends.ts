import type { PlayerCommand } from '@melodesk/bridge/protocol';
import { useFeatures } from '../core/registry';

/**
 * Where a playback command goes. The app has one player bar, one queue and one set of shortcuts, and
 * sends every command through `sendCommand`. What actually plays is a **source**, each one a
 * `PlaybackBackend` that registers itself here: YouTube Music (features/youtube-music), your own
 * music (features/local-music), and whatever comes next. This file knows none of them by name.
 *
 * A backend says which commands it answers (`handles`) and which would make it start something new
 * (`starts`, so the source that is playing steps aside). One backend can be the `fallback`: it answers
 * when nothing is playing, and playback returns to it when another source gives up the player.
 */
export interface PlaybackBackend {
  id: string;
  /** The feature that provides it: the backend is left out while that feature is switched off. */
  feature?: string;
  /** Whether it answers this command while it is the source that is playing. */
  handles: (command: PlayerCommand) => boolean;
  /** Whether this command would make it start something, so the playing source should step aside. */
  starts?: (command: PlayerCommand) => boolean;
  /** Answers when no source is playing, and gets the player back when another one stops. */
  fallback?: boolean;
  /** Carry out a command. Absent in a window where this backend does not run (the main window does). */
  send?: (command: PlayerCommand) => Promise<void> | void;
  /** Another source is about to start: stop and give the player back. */
  yield?: () => void;
  /** Start listening for what the source reports (run once, in every window); returns the way to stop. */
  attach?: () => () => void;
}

const registry = new Map<string, PlaybackBackend>();

/** Add a backend, replacing one with the same id. Returns the way to put the previous one back. */
export function registerBackend(backend: PlaybackBackend): () => void {
  const previous = registry.get(backend.id);
  registry.set(backend.id, backend);
  return () => {
    if (registry.get(backend.id) !== backend) return;
    if (previous) registry.set(backend.id, previous);
    else registry.delete(backend.id);
  };
}

export const backendById = (id: string): PlaybackBackend | undefined => registry.get(id);
/** The backends whose feature is on (a backend with no feature is always on). */
export const allBackends = (): PlaybackBackend[] => {
  const on = new Set(useFeatures.getState().active.map((f) => f.id));
  return [...registry.values()].filter((b) => b.feature === undefined || on.has(b.feature));
};
export const fallbackId = (): string => allBackends().find((b) => b.fallback === true)?.id ?? '';

export interface Route {
  /** The backend that carries the command out. */
  to: string;
  /** The backend that was playing and must step aside first, when this command starts something else. */
  yieldFrom: string | null;
}

/** Decide where a command goes (a pure function of who is playing and who is registered). */
export function resolveRoute(
  command: PlayerCommand,
  active: string,
  backends: readonly Pick<PlaybackBackend, 'id' | 'handles' | 'starts' | 'fallback'>[],
): Route | null {
  const playing = active || (backends.find((b) => b.fallback === true)?.id ?? '');
  const current = backends.find((b) => b.id === playing);
  if (current?.handles(command)) return { to: current.id, yieldFrom: null };
  const starter = backends.find((b) => b.id !== playing && b.starts?.(command) === true);
  if (starter) return { to: starter.id, yieldFrom: current?.id ?? null };
  const other = backends.find((b) => b.id !== playing && b.handles(command));
  return other ? { to: other.id, yieldFrom: null } : null;
}

const attached = new Map<string, () => void>();

/** Start a backend listening to what its source reports. Does nothing if it already is. */
export function attachBackend(id: string): void {
  if (attached.has(id)) return;
  const attach = registry.get(id)?.attach;
  if (attach) attached.set(id, attach());
}

export function detachBackend(id: string): void {
  attached.get(id)?.();
  attached.delete(id);
}

/** Start every backend that is on listening (once per window). Returns the way to stop them all. */
export function attachBackends(): () => void {
  for (const b of allBackends()) attachBackend(b.id);
  return () => {
    for (const id of [...attached.keys()]) detachBackend(id);
  };
}
