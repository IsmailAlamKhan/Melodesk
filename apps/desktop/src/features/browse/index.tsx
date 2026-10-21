import { BROWSE_IDS } from '@melodesk/adapter';
import { Compass } from 'lucide-react';
import { defineFeature } from '../../core';
import { BrowsePage } from './BrowsePage';

export default defineFeature({
  id: 'browse',
  name: 'feature.browse.name',
  description: 'feature.browse.description',
  icon: Compass,
  core: true,
  contributes: {
    routes: [
      {
        path: '/explore',
        element: <BrowsePage browseId={BROWSE_IDS.explore} titleKey="nav.explore" />,
      },
      {
        path: '/charts',
        element: <BrowsePage browseId={BROWSE_IDS.charts} titleKey="browse.charts" />,
      },
      {
        path: '/moods',
        element: <BrowsePage browseId={BROWSE_IDS.moods} titleKey="browse.moods" />,
      },
      {
        path: '/new-releases',
        element: <BrowsePage browseId={BROWSE_IDS.newReleases} titleKey="browse.newReleases" />,
      },
      { path: '/browse/:browseId', element: <BrowsePage /> },
    ],
    nav: [{ id: 'explore', to: '/explore', label: 'nav.explore', icon: Compass, order: 20 }],
  },
});
