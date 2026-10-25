import { SlidersVertical } from 'lucide-react';
import { defineFeature } from '../../core';
import { useAudioPrefs } from '../../audio/store';
import { EqualizerPanel, SoundSection } from './EqualizerPanel';

/**
 * The sound settings: an equalizer, loudness leveling and crossfade, in Settings and as a tab in
 * Now Playing. They apply to local songs everywhere; YouTube's own playback can only be processed
 * where the web player allows it (see the Audio engine feature).
 */
export default defineFeature({
  id: 'sound',
  name: 'feature.sound.name',
  description: 'feature.sound.description',
  icon: SlidersVertical,
  contributes: {
    settings: [{ id: 'sound', category: 'general', order: 25, component: SoundSection }],
    slots: {
      'nowPlaying.side': [
        {
          id: 'equalizer',
          order: 40,
          label: 'nowPlaying.equalizer',
          icon: SlidersVertical,
          component: EqualizerPanel,
        },
      ],
    },
  },
  start: () => {
    void useAudioPrefs.getState().load();
  },
});
