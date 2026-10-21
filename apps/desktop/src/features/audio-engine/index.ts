import { SlidersVertical } from 'lucide-react';
import { defineFeature } from '../../core';
import { startAudioSync } from './sync';

/**
 * Equalizer and volume leveling through Web Audio on the player's media element. WebKit (macOS,
 * Linux) gives that route silence for YouTube's streams, so the engine in the bridge refuses there
 * and this stays off by default; it has no Settings screen yet (see docs/architecture.md).
 */
export default defineFeature({
  id: 'audio-engine',
  name: 'feature.audio-engine.name',
  description: 'feature.audio-engine.description',
  icon: SlidersVertical,
  defaultEnabled: false,
  start: startAudioSync,
});
