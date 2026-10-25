import { ArchiveRestore } from 'lucide-react';
import { defineFeature } from '../../core';
import { BackupSection } from './BackupSection';

/** Save the app's settings (and listening history) to a file, and put them back. */
export default defineFeature({
  id: 'backup',
  name: 'feature.backup.name',
  description: 'feature.backup.description',
  icon: ArchiveRestore,
  contributes: {
    settings: [{ id: 'backup', category: 'storage', order: 40, component: BackupSection }],
  },
});
