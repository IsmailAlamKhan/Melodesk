import { BROWSE_IDS } from '@melodesk/adapter';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { Layout } from './Layout';
import { BrowsePage } from './pages/BrowsePage';
import { DetailPage } from './pages/DetailPage';
import { HomePage } from './pages/HomePage';
import { LibraryLayout, LibrarySection } from './pages/LibraryPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatsPage } from './pages/StatsPage';

// Memory history: a desktop app has no URL bar, and the player webview owns the real URLs.
// Dev aid: VITE_DEV_ROUTE=/playlist/… opens the app on that route (there is no URL bar to type into).
const initialEntries = [
  import.meta.env.DEV && typeof import.meta.env.VITE_DEV_ROUTE === 'string'
    ? import.meta.env.VITE_DEV_ROUTE
    : '/',
];

export const router = createMemoryRouter(
  [
    {
      path: '/',
      element: <Layout />,
      children: [
        { index: true, element: <HomePage /> },
        {
          path: 'explore',
          element: <BrowsePage browseId={BROWSE_IDS.explore} titleKey="nav.explore" />,
        },
        {
          path: 'charts',
          element: <BrowsePage browseId={BROWSE_IDS.charts} titleKey="browse.charts" />,
        },
        {
          path: 'moods',
          element: <BrowsePage browseId={BROWSE_IDS.moods} titleKey="browse.moods" />,
        },
        {
          path: 'new-releases',
          element: <BrowsePage browseId={BROWSE_IDS.newReleases} titleKey="browse.newReleases" />,
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
            {
              path: 'playlists',
              element: <LibrarySection browseId={BROWSE_IDS.libraryPlaylists} />,
            },
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
        { path: 'stats', element: <StatsPage /> },
      ],
    },
  ],
  { initialEntries },
);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
