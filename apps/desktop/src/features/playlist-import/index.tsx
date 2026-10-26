import { FileUp } from 'lucide-react';
import { defineFeature } from '../../core';
import { t } from '../../i18n';
import { ImportHost, openImport } from './ImportDialog';
import { SidebarImport } from './SidebarImport';

/** Bring a playlist from a file (CSV, M3U, JSON or a plain list) into your YouTube Music account. */
export default defineFeature({
  id: 'playlist-import',
  name: 'feature.playlist-import.name',
  description: 'feature.playlist-import.description',
  icon: FileUp,
  dependsOn: ['youtube-music'],
  contributes: {
    overlays: [{ id: 'import-dialog', component: ImportHost }],
    slots: { 'sidebar.sections': [{ id: 'import', order: 20, component: SidebarImport }] },
    commands: () => [
      {
        id: 'import-playlist',
        label: t('import.open'),
        icon: <FileUp className="size-4" />,
        keywords: 'csv m3u spotify playlist file',
        run: openImport,
      },
    ],
  },
});
