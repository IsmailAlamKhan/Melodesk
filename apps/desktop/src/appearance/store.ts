import { create } from 'zustand';
import { kvGet, kvSet } from '../data/kv';
import type { AccentPresetId } from './color';
import type { ContrastLevel } from './material';

export type ThemeMode = 'system' | 'light' | 'dark' | 'amoled';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type Direction = 'auto' | 'ltr' | 'rtl';
export type Accent =
  { kind: 'preset'; id: AccentPresetId } | { kind: 'custom'; hex: string } | { kind: 'art' };

export interface AppearancePrefs {
  theme: ThemeMode;
  /** Material contrast level for text and controls. */
  contrast: ContrastLevel;
  accent: Accent;
  density: Density;
  /** Text direction: follow the language, or force one. */
  direction: Direction;
  /** "system" or a locale code such as "en". */
  language: string;
  /** Colour artist, album and playlist pages from their artwork. */
  pageColors: boolean;
}

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: 'system',
  contrast: 'standard',
  accent: { kind: 'preset', id: 'purple' },
  density: 'comfortable',
  direction: 'auto',
  language: 'system',
  pageColors: true,
};

export const MIRROR_KEY = 'melodesk.appearance';
const KV_KEY = 'appearance:prefs';

/** Merge unknown input over the defaults, dropping anything invalid. */
export function sanitize(raw: unknown): AppearancePrefs {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  const a = o['accent'] as Record<string, unknown> | undefined;
  let accent: Accent = DEFAULT_APPEARANCE.accent;
  if (a?.['kind'] === 'art') accent = { kind: 'art' };
  else if (
    a?.['kind'] === 'custom' &&
    typeof a['hex'] === 'string' &&
    /^#[0-9a-f]{6}$/iu.test(a['hex'])
  )
    accent = { kind: 'custom', hex: a['hex'] };
  else if (a?.['kind'] === 'preset' && typeof a['id'] === 'string')
    accent = { kind: 'preset', id: a['id'] as AccentPresetId };
  return {
    theme: pick(o['theme'], ['system', 'light', 'dark', 'amoled'], 'system'),
    contrast: pick(o['contrast'], ['standard', 'medium', 'high'], 'standard'),
    accent,
    density: pick(o['density'], ['compact', 'comfortable', 'spacious'], 'comfortable'),
    direction: pick(o['direction'], ['auto', 'ltr', 'rtl'], 'auto'),
    language:
      typeof o['language'] === 'string' && /^[\w-]{2,12}$/u.test(o['language'])
        ? o['language']
        : 'system',
    pageColors: typeof o['pageColors'] === 'boolean' ? o['pageColors'] : true,
  };
}

interface State extends AppearancePrefs {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppearancePrefs>) => void;
  /** Re-read the localStorage mirror (another window changed it). */
  syncFromMirror: () => void;
}

function snapshot(s: AppearancePrefs): AppearancePrefs {
  return {
    theme: s.theme,
    contrast: s.contrast,
    accent: s.accent,
    density: s.density,
    direction: s.direction,
    language: s.language,
    pageColors: s.pageColors,
  };
}

function readMirror(): AppearancePrefs | null {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export const useAppearance = create<State>((set, get) => ({
  ...(readMirror() ?? DEFAULT_APPEARANCE),
  loaded: false,
  load: async () => {
    try {
      const raw = await kvGet(KV_KEY);
      if (raw) set({ ...sanitize(JSON.parse(raw)), loaded: true });
      else set({ loaded: true });
      // Development only: VITE_DEV_APPEARANCE='{"theme":"light","direction":"rtl"}' previews a
      // look without touching the saved preferences.
      const dev: unknown = import.meta.env.DEV ? import.meta.env.VITE_DEV_APPEARANCE : undefined;
      if (typeof dev === 'string')
        set(sanitize({ ...snapshot(get()), ...(JSON.parse(dev) as object) }));
    } catch {
      set({ loaded: true });
    }
  },
  update: (patch) => {
    set(patch);
    const next = snapshot(get());
    try {
      localStorage.setItem(MIRROR_KEY, JSON.stringify(next));
    } catch {
      /* private mode: the SQLite copy still persists it */
    }
    void kvSet(KV_KEY, JSON.stringify(next)).catch(() => undefined);
  },
  syncFromMirror: () => {
    const m = readMirror();
    if (m) set(m);
  },
}));
