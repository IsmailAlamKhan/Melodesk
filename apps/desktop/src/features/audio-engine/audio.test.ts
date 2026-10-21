import { EQ_BAND_COUNT, AudioConfigSchema } from '@melodesk/bridge/protocol';
import { describe, expect, it } from 'vitest';
import { FLAT, PRESETS, clampDb, matchPreset } from './presets';
import { DEFAULT_AUDIO, sanitizeAudio, toConfig } from './store';

describe('audio presets', () => {
  it('every preset has one gain per band, within range', () => {
    for (const p of PRESETS) {
      expect(p.gains).toHaveLength(EQ_BAND_COUNT);
      expect(p.gains.every((g) => Math.abs(g) <= 12)).toBe(true);
    }
  });

  it('recognises a preset curve and reports custom curves as null', () => {
    expect(matchPreset(FLAT)).toBe('flat');
    expect(matchPreset([6, 5, 4, 2, 0, 0, 0, 0, 0, 0])).toBe('bassBoost');
    expect(matchPreset([1, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });

  it('clamps and neutralises bad values', () => {
    expect(clampDb(40)).toBe(12);
    expect(clampDb(-40)).toBe(-12);
    expect(clampDb(Number.NaN)).toBe(0);
  });
});

describe('audio prefs', () => {
  it('falls back to defaults for garbage', () => {
    expect(sanitizeAudio(null)).toEqual(DEFAULT_AUDIO);
    expect(sanitizeAudio({ gainsDb: [1, 2, 3] }).gainsDb).toEqual([...FLAT]);
  });

  it('clamps stored gains', () => {
    const out = sanitizeAudio({ eqEnabled: true, preampDb: 99, gainsDb: new Array(10).fill(-99) });
    expect(out.eqEnabled).toBe(true);
    expect(out.preampDb).toBe(12);
    expect(out.gainsDb.every((g) => g === -12)).toBe(true);
  });

  it('produces a config the bridge protocol accepts', () => {
    expect(AudioConfigSchema.safeParse(toConfig(DEFAULT_AUDIO)).success).toBe(true);
    expect(
      AudioConfigSchema.safeParse({
        eq: { enabled: true, preampDb: 0, gainsDb: [0] },
        normalize: false,
      }).success,
    ).toBe(false);
  });
});
