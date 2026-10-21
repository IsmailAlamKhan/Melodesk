import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { kvGet, kvSet } from '../data/kv';
import type { Feature } from './feature';

const KV_KEY = 'features:overrides';
const MIRROR_KEY = 'melodesk.features';

export type WindowKind = 'main' | 'mini';

export function windowKind(): WindowKind {
  if (typeof window === 'undefined') return 'main';
  return new URLSearchParams(window.location.search).get('window') === 'mini' ? 'mini' : 'main';
}

/** Whether the user (or the default) wants the feature on, before dependencies are considered. */
export function wanted(f: Feature, overrides: Readonly<Record<string, boolean>>): boolean {
  return f.core === true || (overrides[f.id] ?? f.defaultEnabled ?? true);
}

/**
 * The features that are actually active: wanted, with the native modules they need present, and
 * with every dependency active too. `native` is null when the build's modules are unknown (assume
 * everything is there).
 */
export function computeActive(
  features: readonly Feature[],
  overrides: Readonly<Record<string, boolean>>,
  native: ReadonlySet<string> | null,
): Feature[] {
  const byId = new Map(features.map((f) => [f.id, f]));
  const active = new Set(
    features
      .filter(
        (f) =>
          wanted(f, overrides) && (f.requires ?? []).every((r) => native === null || native.has(r)),
      )
      .map((f) => f.id),
  );
  for (let changed = true; changed;) {
    changed = false;
    for (const id of [...active]) {
      const deps = byId.get(id)?.dependsOn ?? [];
      if (deps.some((d) => !active.has(d))) {
        active.delete(id);
        changed = true;
      }
    }
  }
  return features.filter((f) => active.has(f.id));
}

/** Every feature `id` (transitively) depends on. */
export function dependenciesOf(id: string, features: readonly Feature[]): Feature[] {
  const byId = new Map(features.map((f) => [f.id, f]));
  const out = new Set<string>();
  const visit = (x: string): void => {
    for (const d of byId.get(x)?.dependsOn ?? [])
      if (!out.has(d)) {
        out.add(d);
        visit(d);
      }
  };
  visit(id);
  return features.filter((f) => out.has(f.id));
}

/** Every feature that (transitively) depends on `id`. */
export function dependentsOf(id: string, features: readonly Feature[]): Feature[] {
  const out = new Set<string>();
  for (let changed = true; changed;) {
    changed = false;
    for (const f of features)
      if (!out.has(f.id) && (f.dependsOn ?? []).some((d) => d === id || out.has(d))) {
        out.add(f.id);
        changed = true;
      }
  }
  return features.filter((f) => out.has(f.id));
}

/** Problems that would make a set of features misbehave; empty when it is sound. */
export function validateFeatures(features: readonly Feature[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const f of features) {
    if (!/^[a-z][a-z0-9-]*$/u.test(f.id)) problems.push(`feature id "${f.id}" must be kebab-case`);
    if (ids.has(f.id)) problems.push(`duplicate feature id "${f.id}"`);
    ids.add(f.id);
  }
  for (const f of features) {
    for (const d of f.dependsOn ?? []) {
      if (!ids.has(d)) problems.push(`"${f.id}" depends on unknown feature "${d}"`);
      if (d === f.id) problems.push(`"${f.id}" depends on itself`);
    }
    const dependsOnNonCore = f.core === true && (f.dependsOn ?? []).length > 0;
    if (dependsOnNonCore) {
      for (const d of f.dependsOn ?? [])
        if (features.find((x) => x.id === d)?.core !== true)
          problems.push(`core feature "${f.id}" depends on optional feature "${d}"`);
    }
  }
  // Dependency cycles, reported with their path.
  const byId = new Map(features.map((x) => [x.id, x]));
  const state = new Map<string, 'visiting' | 'done'>();
  const walk = (id: string, path: string[]): void => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') {
      problems.push(`dependency cycle: ${[...path.slice(path.indexOf(id)), id].join(' -> ')}`);
      return;
    }
    state.set(id, 'visiting');
    for (const d of byId.get(id)?.dependsOn ?? []) if (byId.has(d)) walk(d, [...path, id]);
    state.set(id, 'done');
  };
  for (const x of features) walk(x.id, []);
  // The same route path from two features would shadow one another.
  const seen = new Map<string, string>();
  for (const f of features)
    for (const r of f.contributes?.routes ?? []) {
      const key = r.index === true ? '(index)' : (r.path ?? '');
      const other = seen.get(key);
      if (other !== undefined && other !== f.id)
        problems.push(`route "${key}" is defined by both "${other}" and "${f.id}"`);
      seen.set(key, f.id);
    }
  return problems;
}

function readMirror(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (e): e is [string, boolean] => typeof e[1] === 'boolean',
      ),
    );
  } catch {
    return {};
  }
}

interface FeatureState {
  features: Feature[];
  /** Explicit on/off choices; absent means "the feature's default". */
  overrides: Record<string, boolean>;
  /** Native modules compiled into this build, or null when unknown. */
  native: ReadonlySet<string> | null;
  active: Feature[];
  loaded: boolean;
  /**
   * Set the features. With `deferStart` their `start()` waits for `load()`, so features that need
   * a native module do not start before the build's modules are known.
   */
  register: (features: Feature[], options?: { deferStart?: boolean }) => void;
  setEnabled: (id: string, enabled: boolean) => void;
  load: () => Promise<void>;
}

const running = new Map<string, (() => void) | undefined>();

function isDispose(value: unknown): value is () => void {
  return typeof value === 'function';
}

/** Start features that became active and stop the ones that did not stay so. */
function sync(active: readonly Feature[]): void {
  const kind = windowKind();
  const ids = new Set(active.map((f) => f.id));
  for (const [id, dispose] of [...running]) {
    if (ids.has(id)) continue;
    running.delete(id);
    try {
      dispose?.();
    } catch (err) {
      console.error(`[features] ${id} failed to stop`, err);
    }
  }
  for (const f of active) {
    if (running.has(f.id) || !f.start) continue;
    if ((f.scope ?? 'main') === 'main' && kind !== 'main') continue;
    try {
      const result = f.start();
      running.set(f.id, isDispose(result) ? result : undefined);
    } catch (err) {
      console.error(`[features] ${f.id} failed to start`, err);
    }
  }
}

export const useFeatures = create<FeatureState>((set, get) => ({
  features: [],
  overrides: readMirror(),
  native: null,
  active: [],
  loaded: false,
  register: (list, options) => {
    const features = [...list].sort(
      (a, b) => Number(b.core ?? false) - Number(a.core ?? false) || a.id.localeCompare(b.id),
    );
    const problems = validateFeatures(features);
    if (problems.length > 0)
      console.error('[features] invalid feature set:\n' + problems.join('\n'));
    const { overrides, native } = get();
    const active = computeActive(features, overrides, native);
    set({ features, active });
    if (options?.deferStart !== true) sync(active);
  },
  setEnabled: (id, enabled) => {
    const f = get().features.find((x) => x.id === id);
    if (!f || f.core) return;
    const overrides = { ...get().overrides, [id]: enabled };
    // Turning a feature on brings what it needs along; turning it off leaves the others alone.
    if (enabled)
      for (const dep of dependenciesOf(id, get().features)) if (!dep.core) overrides[dep.id] = true;
    const active = computeActive(get().features, overrides, get().native);
    set({ overrides, active });
    try {
      localStorage.setItem(MIRROR_KEY, JSON.stringify(overrides));
    } catch {
      /* private mode: the SQLite copy still persists it */
    }
    void kvSet(KV_KEY, JSON.stringify(overrides)).catch(() => undefined);
    sync(active);
  },
  load: async () => {
    let overrides = get().overrides;
    try {
      const raw = await kvGet(KV_KEY);
      if (raw) overrides = { ...JSON.parse(raw), ...overrides } as Record<string, boolean>;
    } catch {
      /* use what we have */
    }
    let native: ReadonlySet<string> | null = null;
    try {
      const modules = await invoke<unknown>('native_modules');
      if (Array.isArray(modules)) native = new Set(modules.filter((m) => typeof m === 'string'));
    } catch {
      /* an older shell: assume every native module exists */
    }
    const active = computeActive(get().features, overrides, native);
    set({ overrides, native, active, loaded: true });
    sync(active);
  },
}));
