import { describe, expect, it } from 'vitest';
import { BAND_COUNT, emptyLevels } from './levels';
import { bandEdges, levelsFromSpectrum, newBeatState } from './spectrum';

const RATE = 44_100;
const BINS = 512;

describe('bandEdges', () => {
  it('covers the spectrum in order, every band at least one bin wide', () => {
    const edges = bandEdges(BINS, RATE);
    expect(edges).toHaveLength(BAND_COUNT);
    for (let i = 0; i < edges.length; i += 1) {
      const [from, to] = edges[i] ?? [0, 0];
      expect(to).toBeGreaterThan(from);
      if (i > 0) expect(from).toBe(edges[i - 1]?.[1]);
    }
    // Spaced like pitch: the low bands are narrow, the high ones wide.
    const widths = edges.map(([a, b]) => b - a);
    expect(widths[BAND_COUNT - 1]).toBeGreaterThan(widths[0] ?? 0);
  });
});

describe('levelsFromSpectrum', () => {
  const quiet = new Uint8Array(BINS);

  it('is silent for silence', () => {
    const out = emptyLevels();
    levelsFromSpectrum(quiet, RATE, out, newBeatState());
    expect(out.energy).toBe(0);
    expect(out.bass).toBe(0);
    expect(out.beat).toBe(0);
  });

  it('puts a low tone in the low bands and the bass, not the high ones', () => {
    const spectrum = new Uint8Array(BINS);
    for (let b = 1; b < 4; b += 1) spectrum[b] = 255; // up to about 170 Hz
    const out = emptyLevels();
    levelsFromSpectrum(spectrum, RATE, out, newBeatState());
    expect(out.bass).toBeGreaterThan(0.5);
    const low = out.bands.slice(0, 6).reduce((a, b) => a + b, 0);
    const high = out.bands.slice(BAND_COUNT - 6).reduce((a, b) => a + b, 0);
    expect(low).toBeGreaterThan(0);
    expect(high).toBe(0);
  });

  it('finds a beat when the bass jumps, and lets it fall away', () => {
    const state = newBeatState();
    const out = emptyLevels();
    const loud = new Uint8Array(BINS).fill(255);
    levelsFromSpectrum(quiet, RATE, out, state);
    levelsFromSpectrum(loud, RATE, out, state);
    expect(out.beat).toBe(1);
    levelsFromSpectrum(quiet, RATE, out, state);
    expect(out.beat).toBeLessThan(1);
    expect(out.beat).toBeGreaterThan(0);
  });

  it('keeps every level between 0 and 1', () => {
    const out = emptyLevels();
    levelsFromSpectrum(new Uint8Array(BINS).fill(255), RATE, out, newBeatState());
    for (const v of [out.energy, out.bass, out.beat, ...out.bands]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
