import { bandEdges, levelsFromSpectrum, newBeatState } from '../../core';
import type { LevelSource } from '../../core';
import { usePlayerStore } from '../../player/store';
import type { AudioGraph } from './dsp';

/**
 * Levels read from the sound of the local song that is playing, for the visuals (the Visualizer
 * tab, the glows and bars). Unlike the web player's, this audio can be measured on every system.
 */
export function createAnalyserSource(graph: AudioGraph): LevelSource {
  const bins = new Uint8Array(graph.analyser.frequencyBinCount);
  const edges = bandEdges(bins.length, graph.ctx.sampleRate);
  const beat = newBeatState();
  const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    id: 'local-analyser',
    real: true,
    isPlaying: () => {
      const s = usePlayerStore.getState();
      return s.source === 'local' && (s.state?.playing ?? false) && !reduced();
    },
    sample: (_now, out) => {
      graph.analyser.getByteFrequencyData(bins);
      levelsFromSpectrum(bins, graph.ctx.sampleRate, out, beat, edges);
    },
  };
}
