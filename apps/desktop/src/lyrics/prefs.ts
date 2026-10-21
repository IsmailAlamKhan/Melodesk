import { create } from 'zustand';
import { kvGet, kvSet } from '../data/kv';
import type { Provider } from './translate';

export interface LyricsPrefs {
  romanize: boolean;
  translate: boolean;
  target: string;
  /** "auto" or a language code (needed for romanized lyrics such as Hinglish). */
  source: string;
  provider: Provider;
  libreUrl: string;
  libreKey: string;
  /** The user has agreed to send lyric text to MyMemory. */
  translationConsent: boolean;
  /** Karaoke lyric size. */
  karaokeSize: 'm' | 'l' | 'xl';
}

const DEFAULTS: LyricsPrefs = {
  romanize: false,
  translate: false,
  target: 'en',
  source: 'auto',
  provider: 'mymemory',
  libreUrl: 'http://localhost:5000',
  libreKey: '',
  translationConsent: false,
  karaokeSize: 'l',
};

const KEY = 'lyrics:prefs';

interface State extends LyricsPrefs {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<LyricsPrefs>) => void;
}

export const useLyricsPrefs = create<State>((set, get) => ({
  ...DEFAULTS,
  loaded: false,
  load: async () => {
    try {
      const raw = await kvGet(KEY);
      set({ ...(raw ? (JSON.parse(raw) as Partial<LyricsPrefs>) : {}), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  update: (patch) => {
    set(patch);
    const s = get();
    const prefs: LyricsPrefs = {
      romanize: s.romanize,
      translate: s.translate,
      target: s.target,
      source: s.source,
      provider: s.provider,
      libreUrl: s.libreUrl,
      libreKey: s.libreKey,
      translationConsent: s.translationConsent,
      karaokeSize: s.karaokeSize,
    };
    void kvSet(KEY, JSON.stringify(prefs)).catch(() => undefined);
  },
}));

/** Per-track sync offset in ms (positive = lyrics appear later). */
export async function loadOffset(videoId: string): Promise<number> {
  const raw = await kvGet(`lyrics:offset:${videoId}`);
  const n = raw === null ? 0 : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export async function saveOffset(videoId: string, ms: number): Promise<void> {
  await kvSet(`lyrics:offset:${videoId}`, String(ms));
}
