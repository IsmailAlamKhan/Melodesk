import { describe, expect, it } from 'vitest';
import { dbToGain, replayGainFactor } from './dsp';

describe('replayGainFactor', () => {
  it('turns a loudness correction in dB into a multiplier', () => {
    expect(replayGainFactor(0, null)).toBeCloseTo(1);
    expect(replayGainFactor(-6, null)).toBeCloseTo(0.501, 2);
    expect(replayGainFactor(6, 0.4)).toBeCloseTo(1.995, 2);
  });
  it('does not boost a song past clipping', () => {
    // +6 dB doubles it; with a peak of 0.9 that would clip, so it stops at 1/0.9.
    expect(replayGainFactor(6, 0.9)).toBeCloseTo(1 / 0.9, 5);
  });
  it('leaves a song alone when it has no loudness data', () => {
    expect(replayGainFactor(null, 0.5)).toBe(1);
    expect(replayGainFactor(Number.NaN, null)).toBe(1);
  });
  it('converts decibels', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(20)).toBeCloseTo(10);
    expect(dbToGain(-20)).toBeCloseTo(0.1);
  });
});
