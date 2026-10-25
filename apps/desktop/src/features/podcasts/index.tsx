import { Podcast } from 'lucide-react';
import { defineFeature, navigateTo } from '../../core';
import { t } from '../../i18n';
import { PodcastsPage, ShowPage } from './PodcastsPage';
import { loadPodcasts } from './store';

/**
 * Follow podcasts by their feed (or find them in the iTunes directory) and play episodes in the local
 * player, which remembers where you stopped. It needs the Local music feature, which provides that player.
 */
export default defineFeature({
  id: 'podcasts',
  name: 'feature.podcasts.name',
  description: 'feature.podcasts.description',
  icon: Podcast,
  dependsOn: ['local-music'],
  contributes: {
    routes: [
      { path: '/podcasts', element: <PodcastsPage /> },
      { path: '/podcasts/show', element: <ShowPage /> },
    ],
    nav: [{ id: 'podcasts', to: '/podcasts', label: 'nav.podcasts', icon: Podcast, order: 37 }],
    commands: () => [
      {
        id: 'podcasts',
        label: t('palette.cmd.podcasts'),
        icon: <Podcast className="size-4" />,
        keywords: 'feed rss episodes',
        run: () => navigateTo('/podcasts'),
      },
    ],
  },
  start: () => {
    void loadPodcasts();
  },
});
