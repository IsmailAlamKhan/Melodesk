import { BAND_COUNT, type LevelSource, type Levels } from '../../core';
import { usePlayerStore } from '../../player/store';

/** FNV-1a, so the same track always gets the same tempo and the same wobble. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A tempo between 84 and 140 beats per minute, fixed for a track. */
export function tempoFor(seed: string): number {
  return 84 + (hash(seed) % 57);
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * Levels that follow the rhythm of playback without hearing it: a kick on every beat (stronger on
 * the first of four), a hat between the beats, a slow swell like verse and chorus, and a wobble per
 * band. It is a function of the track and the position only, so seeking and replaying look the same.
 * (On Windows the player's audio could be measured for real; WebKit on macOS and Linux gives the page
 * silence for streams, see docs/architecture.md.)
 */
export function simulate(seed: string, positionSeconds: number, out: Levels): void {
  const h = hash(seed);
  const beatPos = (positionSeconds * tempoFor(seed)) / 60;
  const phase = beatPos - Math.floor(beatPos);
  const offPhase = beatPos + 0.5 - Math.floor(beatPos + 0.5);
  const accent = Math.floor(beatPos) % 4 === 0 ? 1 : 0.78;
  const kick = Math.exp(-phase * 7) * accent;
  const hat = Math.exp(-offPhase * 14) * 0.6;
  const section = 0.8 + 0.2 * Math.sin(positionSeconds / (14 + (h % 9)) + (h % 7));
  let energy = 0;
  let bass = 0;
  for (let i = 0; i < BAND_COUNT; i += 1) {
    const x = i / (BAND_COUNT - 1);
    const tilt = 0.95 - 0.55 * x;
    const wobble =
      0.55 +
      0.25 * Math.sin(positionSeconds * (1.3 + ((i * 0.37) % 2.1)) + i * 1.7 + (h % 13)) +
      0.2 * Math.sin(positionSeconds * (2.9 + ((i * 0.53) % 1.7)) + i * 0.9 + (h % 5));
    const hits = i < 6 ? kick * 0.55 : i > 20 ? hat * 0.5 : kick * 0.15;
    const v = clamp01(tilt * wobble * section + hits);
    out.bands[i] = v;
    energy += v;
    if (i < 6) bass += v;
  }
  out.energy = energy / BAND_COUNT;
  out.bass = bass / 6;
  out.beat = kick;
}

/** The source the Visualizer feature registers: follows the player store and honours reduced motion. */
export function createSimulatedSource(): LevelSource {
  const reduced = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    id: 'simulated',
    real: false,
    isPlaying: () => (usePlayerStore.getState().state?.playing ?? false) && !reduced(),
    sample: (nowMs, out) => {
      const { state, track } = usePlayerStore.getState();
      if (!state) return;
      const position = state.position + Math.max(0, nowMs - state.sampledAt) / 1000;
      simulate(track?.videoId ?? track?.title ?? 'none', position, out);
    },
  };
}
