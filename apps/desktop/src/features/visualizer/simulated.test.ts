import { describe, expect, it } from 'vitest';
import { BAND_COUNT, emptyLevels } from '../../core';
import { simulate, tempoFor } from './simulated';

const at = (seed: string, seconds: number) => {
  const out = emptyLevels();
  simulate(seed, seconds, out);
  return out;
};

describe('simulated levels', () => {
  it('stay between 0 and 1 for any track and time', () => {
    for (const seed of ['a', 'dQw4w9WgXcQ', '', 'ünï©ode'])
      for (let s = 0; s < 240; s += 0.37) {
        const l = at(seed, s);
        expect(l.bands).toHaveLength(BAND_COUNT);
        for (const v of [...l.bands, l.energy, l.bass, l.beat]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
  });

  it('are the same every time for the same track and position, and differ between tracks', () => {
    expect([...at('one', 42.5).bands]).toEqual([...at('one', 42.5).bands]);
    expect([...at('one', 42.5).bands]).not.toEqual([...at('two', 42.5).bands]);
  });

  it('give each track a tempo in a believable range', () => {
    for (const seed of ['x', 'y', 'z', '123', 'abc'])
      expect(tempoFor(seed)).toBeGreaterThanOrEqual(84);
    for (const seed of ['x', 'y', 'z', '123', 'abc'])
      expect(tempoFor(seed)).toBeLessThanOrEqual(140);
  });

  it('pulse on the beat: the kick is at its peak on a beat and has faded before the next', () => {
    const seed = 'tempo-check';
    const beat = 60 / tempoFor(seed);
    const onBeat = at(seed, beat * 8).beat;
    const between = at(seed, beat * 8.9).beat;
    expect(onBeat).toBeGreaterThan(0.9);
    expect(between).toBeLessThan(0.05);
  });
});
