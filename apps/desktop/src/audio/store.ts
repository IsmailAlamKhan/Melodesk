import { EQ_BAND_COUNT, type AudioConfig } from '@melodesk/bridge/protocol';
import { create } from 'zustand';
import { kvGet, kvSet } from '../data/kv';
import { FLAT, clampDb } from './presets';

export interface AudioPrefs {
  eqEnabled: boolean;
  preampDb: number;
  gainsDb: number[];
  normalize: boolean;
}

export const DEFAULT_AUDIO: AudioPrefs = {
  eqEnabled: false,
  preampDb: 0,
  gainsDb: [...FLAT],
  normalize: false,
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
    const { eqEnabled, preampDb, gainsDb, normalize } = get();
    void kvSet(KV_KEY, JSON.stringify({ eqEnabled, preampDb, gainsDb, normalize })).catch(
      () => undefined,
    );
  },
}));
