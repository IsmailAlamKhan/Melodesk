import { Wrench } from 'lucide-react';
import { defineFeature } from '../../core';
import { PlaylistToolsMenu } from './PlaylistToolsMenu';

export default defineFeature({
  id: 'playlist-tools',
  name: 'feature.playlist-tools.name',
  description: 'feature.playlist-tools.description',
  icon: Wrench,
  contributes: {
    slots: { 'playlist.header': [{ id: 'menu', component: PlaylistToolsMenu }] },
  },
});
