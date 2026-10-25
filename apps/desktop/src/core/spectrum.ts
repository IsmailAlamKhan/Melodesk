import { BAND_COUNT, type Levels } from './levels';

/** What carries from one reading to the next, so a beat is a jump above the recent bass. */
export interface BeatState {
  bassAverage: number;
  beat: number;
}
export const newBeatState = (): BeatState => ({ bassAverage: 0, beat: 0 });

const LOW_HZ = 40;
const HIGH_HZ = 16_000;
const BASS_HZ = 150;

/** First and one-past-last FFT bin of each of the BAND_COUNT bands, spaced like pitch (logarithmic). */
export function bandEdges(binCount: number, sampleRate: number): [number, number][] {
  const nyquist = sampleRate / 2;
  const top = Math.min(HIGH_HZ, nyquist);
  const binHz = nyquist / binCount;
  const edges: [number, number][] = [];
  let previous = Math.max(1, Math.floor(LOW_HZ / binHz));
  for (let i = 1; i <= BAND_COUNT; i += 1) {
    const hz = LOW_HZ * Math.pow(top / LOW_HZ, i / BAND_COUNT);
    // Every band has at least one bin, even where bins are wider than the band.
    const end = Math.max(previous + 1, Math.min(binCount, Math.round(hz / binHz)));
    edges.push([previous, end]);
    previous = end;
  }
  return edges;
}

/**
 * Turn an analyser's spectrum (byte magnitudes, 0..255, from `getByteFrequencyData`) into levels:
 * the 32 bands, overall loudness, the bass, and a beat that jumps when the bass rises above its
 * recent average and falls away after.
 */
export function levelsFromSpectrum(
  spectrum: Uint8Array,
  sampleRate: number,
  out: Levels,
  state: BeatState,
  edges: [number, number][] = bandEdges(spectrum.length, sampleRate),
): void {
  let total = 0;
  for (let i = 0; i < BAND_COUNT; i += 1) {
    const [from, to] = edges[i] ?? [0, 1];
    let sum = 0;
    for (let b = from; b < to; b += 1) sum += spectrum[b] ?? 0;
    // Highs carry less energy than lows in real music; lift them a little so the right side moves.
    const lift = 1 + (i / BAND_COUNT) * 0.6;
    const v = Math.min(1, (sum / Math.max(1, to - from) / 255) * lift);
    out.bands[i] = v;
    total += v;
  }
  out.energy = total / BAND_COUNT;

  const binHz = sampleRate / 2 / spectrum.length;
  const bassBins = Math.max(1, Math.round(BASS_HZ / binHz));
  let bass = 0;
  for (let b = 0; b < bassBins; b += 1) bass += spectrum[b] ?? 0;
  bass = Math.min(1, bass / bassBins / 255);
  out.bass = bass;

  const rising = bass > state.bassAverage * 1.25 + 0.08;
  state.bassAverage += (bass - state.bassAverage) * 0.08;
  state.beat = rising ? 1 : state.beat * 0.85;
  out.beat = state.beat;
}
