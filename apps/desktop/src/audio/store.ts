import { EQ_BAND_COUNT, type AudioConfig } from '@melodesk/bridge/protocol';
import { create } from 'zustand';
import { kvGet, kvSet } from '../data/kv';
import { FLAT, clampDb } from './presets';

export interface AudioPrefs {
  eqEnabled: boolean;
  preampDb: number;
  gainsDb: number[];
  normalize: boolean;
  /** Seconds a local song fades into the next (0 plays them back to back). */
  crossfadeSeconds: number;
}

export const MAX_CROSSFADE_SECONDS = 12;

export const DEFAULT_AUDIO: AudioPrefs = {
  eqEnabled: false,
  preampDb: 0,
  gainsDb: [...FLAT],
  normalize: false,
  crossfadeSeconds: 0,
};

const KV_KEY = 'audio:prefs';

export function sanitizeAudio(raw: unknown): AudioPrefs {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const g = Array.isArray(o['gainsDb']) ? (o['gainsDb'] as unknown[]) : [];
  return {
    eqEnabled: o['eqEnabled'] === true,
    preampDb: clampDb(Number(o['preampDb'] ?? 0)),
    gainsDb:
      g.length === EQ_BAND_COUNT ? g.map((x) => clampDb(Number(x))) : [...DEFAULT_AUDIO.gainsDb],
    normalize: o['normalize'] === true,
    crossfadeSeconds: Math.min(
      MAX_CROSSFADE_SECONDS,
      Math.max(0, Math.round(Number(o['crossfadeSeconds'] ?? 0)) || 0),
    ),
  };
}

export function toConfig(p: AudioPrefs): AudioConfig {
  return {
    eq: { enabled: p.eqEnabled, preampDb: p.preampDb, gainsDb: p.gainsDb },
    normalize: p.normalize,
  };
}

interface State extends AudioPrefs {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AudioPrefs>) => void;
}

export const useAudioPrefs = create<State>((set, get) => ({
  ...DEFAULT_AUDIO,
  loaded: false,
  load: async () => {
    try {
      const raw = await kvGet(KV_KEY);
      set({ ...(raw ? sanitizeAudio(JSON.parse(raw)) : {}), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  update: (patch) => {
    set(patch);
    const { eqEnabled, preampDb, gainsDb, normalize, crossfadeSeconds } = get();
    void kvSet(
      KV_KEY,
      JSON.stringify({ eqEnabled, preampDb, gainsDb, normalize, crossfadeSeconds }),
    ).catch(() => undefined);
  },
}));
