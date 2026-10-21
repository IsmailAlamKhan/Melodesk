import { AudioLines } from 'lucide-react';
import { defineFeature, setLevelSource } from '../../core';
import { createSimulatedSource } from './simulated';
import { VisualizerTab } from './VisualizerTab';

/**
 * Visuals that move with the music: a Visualizer tab in Now Playing, and small decorations around
 * the app (the glow behind covers, the bars beside the playing song) that follow the same levels.
 * On this system they follow the rhythm of playback rather than the sound itself.
 */
export default defineFeature({
  id: 'visualizer',
  name: 'feature.visualizer.name',
  description: 'feature.visualizer.description',
  icon: AudioLines,
  contributes: {
    slots: {
      'nowPlaying.side': [
        {
          id: 'visualizer',
          order: 30,
          label: 'nowPlaying.visualizer',
          icon: AudioLines,
          component: VisualizerTab,
        },
      ],
    },
  },
  start: () => setLevelSource(createSimulatedSource()),
});
