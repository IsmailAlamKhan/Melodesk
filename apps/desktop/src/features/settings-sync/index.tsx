import { FolderSync } from 'lucide-react';
import { defineFeature } from '../../core';
import { startSync } from './controller';
import { ReloadBanner } from './ReloadBanner';
import { SyncSection } from './SyncSection';

/** Keeps settings the same on several computers through a folder the user picks (no server, no account). */
export default defineFeature({
  id: 'settings-sync',
  name: 'feature.settingsSync.name',
  description: 'feature.settingsSync.description',
  icon: FolderSync,
  contributes: {
    settings: [{ id: 'sync', category: 'storage', order: 35, component: SyncSection }],
    overlays: [{ id: 'reload', component: ReloadBanner }],
  },
  start: startSync,
});
