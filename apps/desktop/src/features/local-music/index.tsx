import { HardDrive } from 'lucide-react';
import { defineFeature, navigateTo } from '../../core';
import { t } from '../../i18n';
import { startLocalMusic } from './start';
import { LocalAlbumPage, LocalArtistPage } from './LocalDetail';
import { LocalMusicSection } from './LocalSettings';
import { LocalPage } from './LocalPage';
import { TagEditorHost } from './TagEditor';

/** Play the music files on this computer, next to YouTube Music, in the same player. */
export default defineFeature({
  id: 'local-music',
  name: 'feature.local-music.name',
  description: 'feature.local-music.description',
  icon: HardDrive,
  contributes: {
    routes: [
      { path: '/local', element: <LocalPage /> },
      { path: '/local/album', element: <LocalAlbumPage /> },
      { path: '/local/artist', element: <LocalArtistPage /> },
    ],
    overlays: [{ id: 'tag-editor', component: TagEditorHost }],
    nav: [{ id: 'local', to: '/local', label: 'nav.local', icon: HardDrive, order: 35 }],
    commands: () => [
      {
        id: 'local',
        label: t('palette.cmd.local'),
        icon: <HardDrive className="size-4" />,
        keywords: 'music files folder library',
        run: () => navigateTo('/local'),
      },
    ],
    settings: [{ id: 'local-music', category: 'storage', order: 20, component: LocalMusicSection }],
  },
  start: startLocalMusic,
});
