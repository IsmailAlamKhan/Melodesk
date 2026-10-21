import { BarChart3 } from 'lucide-react';
import { defineFeature, navigateTo } from '../../core';
import { t } from '../../i18n';
import { startHistoryRecorder } from './recorder';
import { StatsPage } from './StatsPage';

export default defineFeature({
  id: 'stats',
  name: 'feature.stats.name',
  description: 'feature.stats.description',
  icon: BarChart3,
  contributes: {
    routes: [{ path: '/stats', element: <StatsPage /> }],
    commands: () => [
      {
        id: 'stats',
        label: t('palette.cmd.stats'),
        icon: <BarChart3 className="size-4" />,
        run: () => navigateTo('/stats'),
      },
    ],
    nav: [{ id: 'stats', to: '/stats', label: 'nav.stats', icon: BarChart3, order: 40 }],
  },
  // Records what you listen to while the feature is on; stops (and flushes) when it is turned off.
  start: startHistoryRecorder,
});
