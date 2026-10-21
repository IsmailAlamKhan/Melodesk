import { BROWSE_IDS } from '@melodesk/adapter';
import { Library } from 'lucide-react';
import { defineFeature } from '../../core';
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
  core: true,
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
    nav: [{ id: 'library', to: '/library', label: 'nav.library', icon: Library, order: 30 }],
    slots: { 'sidebar.sections': [{ id: 'playlists', order: 10, component: SidebarPlaylists }] },
  },
});
