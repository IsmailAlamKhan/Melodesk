import { BROWSE_IDS } from '@melodesk/adapter';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Layout } from './Layout';
import { BrowsePage } from './pages/BrowsePage';
import { DetailPage } from './pages/DetailPage';
import { HomePage } from './pages/HomePage';
import { LibraryLayout, LibrarySection } from './pages/LibraryPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';

// Memory history: a desktop app has no URL bar, and the player webview owns the real URLs.
export const router = createMemoryRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'explore', element: <BrowsePage browseId={BROWSE_IDS.explore} title="Explore" /> },
      { path: 'charts', element: <BrowsePage browseId={BROWSE_IDS.charts} title="Charts" /> },
      { path: 'moods', element: <BrowsePage browseId={BROWSE_IDS.moods} title="Moods & genres" /> },
      {
        path: 'new-releases',
        element: <BrowsePage browseId={BROWSE_IDS.newReleases} title="New releases" />,
      },
      { path: 'browse/:browseId', element: <BrowsePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'artist/:id', element: <DetailPage kind="artist" /> },
      { path: 'album/:id', element: <DetailPage kind="album" /> },
      { path: 'playlist/:id', element: <DetailPage kind="playlist" /> },
      {
        path: 'library',
        element: <LibraryLayout />,
        children: [
          { index: true, element: <LibrarySection browseId={BROWSE_IDS.library} /> },
          { path: 'playlists', element: <LibrarySection browseId={BROWSE_IDS.libraryPlaylists} /> },
          { path: 'songs', element: <LibrarySection browseId={BROWSE_IDS.librarySongs} /> },
          { path: 'albums', element: <LibrarySection browseId={BROWSE_IDS.libraryAlbums} /> },
          { path: 'artists', element: <LibrarySection browseId={BROWSE_IDS.libraryArtists} /> },
          {
            path: 'subscriptions',
            element: <LibrarySection browseId={BROWSE_IDS.librarySubscriptions} />,
          },
          { path: 'podcasts', element: <LibrarySection browseId={BROWSE_IDS.libraryPodcasts} /> },
          { path: 'uploads', element: <LibrarySection browseId={BROWSE_IDS.libraryUploads} /> },
          { path: 'history', element: <LibrarySection browseId={BROWSE_IDS.history} /> },
        ],
      },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
