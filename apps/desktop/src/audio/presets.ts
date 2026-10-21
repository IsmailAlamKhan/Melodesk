import { EQ_BAND_COUNT, EQ_MAX_DB } from '@melodesk/bridge/protocol';

export const FLAT: readonly number[] = new Array<number>(EQ_BAND_COUNT).fill(0);

/** Built-in curves, 32 Hz → 16 kHz. Names are message keys (`audio.preset.*`). */
export const PRESETS = [
  { id: 'flat', gains: FLAT },
  { id: 'bassBoost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'trebleBoost', gains: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6] },
  { id: 'vocal', gains: [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1] },
  { id: 'loudness', gains: [5, 4, 1, 0, -1, -1, 0, 2, 4, 3] },
  { id: 'acoustic', gains: [3, 3, 2, 1, 1, 1, 2, 3, 3, 2] },
  { id: 'electronic', gains: [5, 4, 1, 0, -2, 2, 1, 2, 4, 5] },
] as const;
export type PresetId = (typeof PRESETS)[number]['id'];

export const clampDb = (n: number): number =>
  Number.isFinite(n) ? Math.min(EQ_MAX_DB, Math.max(-EQ_MAX_DB, n)) : 0;

/** The preset whose curve matches exactly, or null for a custom curve. */
export function matchPreset(gains: readonly number[]): PresetId | null {
  return PRESETS.find((p) => p.gains.every((g, i) => g === gains[i]))?.id ?? null;
}
