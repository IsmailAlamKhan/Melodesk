import { Info } from 'lucide-react';
import { defineFeature } from '../../core';
import { SongInfoTab } from './SongInfoTab';

/** A "Song info" tab beside the artwork in Now Playing: facts about the song and its artist. */
export default defineFeature({
  id: 'song-info',
  name: 'feature.songInfo.name',
  description: 'feature.songInfo.description',
  icon: Info,
  contributes: {
    slots: {
      'nowPlaying.side': [
        { id: 'song-info', order: 40, label: 'songInfo.tab', icon: Info, component: SongInfoTab },
      ],
    },
  },
});
