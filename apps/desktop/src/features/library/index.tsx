import { BROWSE_IDS } from '@melodesk/adapter';
import { Library, Plus } from 'lucide-react';
import { openDialog } from '../../app/dialogs/store';
import { defineFeature, navigateTo } from '../../core';
import { t } from '../../i18n';
import { LibraryLayout, LibrarySection } from './LibraryPage';
import { SidebarPlaylists } from './SidebarPlaylists';

const section = (path: string, browseId: string) => ({
  path,
  element: <LibrarySection browseId={browseId} />,
});

export default defineFeature({
  id: 'library',
  name: 'feature.library.name',
  description: 'feature.library.description',
  icon: Library,
  dependsOn: ['youtube-music'],
  contributes: {
    routes: [
      {
        path: '/library',
        element: <LibraryLayout />,
        children: [
          { index: true, element: <LibrarySection browseId={BROWSE_IDS.library} /> },
          section('playlists', BROWSE_IDS.libraryPlaylists),
          section('songs', BROWSE_IDS.librarySongs),
          section('albums', BROWSE_IDS.libraryAlbums),
          section('artists', BROWSE_IDS.libraryArtists),
          section('subscriptions', BROWSE_IDS.librarySubscriptions),
          section('podcasts', BROWSE_IDS.libraryPodcasts),
          section('uploads', BROWSE_IDS.libraryUploads),
          section('history', BROWSE_IDS.history),
        ],
      },
    ],
    commands: () => [
      {
        id: 'library',
        label: t('palette.cmd.library'),
        icon: <Library className="size-4" />,
        keywords: t('palette.keywords.library'),
        run: () => navigateTo('/library'),
      },
      {
        id: 'history',
        label: t('palette.cmd.history'),
        icon: <Library className="size-4" />,
        run: () => navigateTo('/library/history'),
      },
      {
        id: 'liked',
        label: t('palette.cmd.liked'),
        icon: <Library className="size-4" />,
        run: () => navigateTo('/playlist/LM'),
      },
      {
        id: 'newplaylist',
        label: t('playlist.new'),
        icon: <Plus className="size-4" />,
        run: () => openDialog({ type: 'createPlaylist' }),
      },
    ],
    nav: [{ id: 'library', to: '/library', label: 'nav.library', icon: Library, order: 30 }],
    slots: { 'sidebar.sections': [{ id: 'playlists', order: 10, component: SidebarPlaylists }] },
  },
});
