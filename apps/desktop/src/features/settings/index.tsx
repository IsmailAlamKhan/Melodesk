import { Settings } from 'lucide-react';
import { defineFeature, navigateTo } from '../../core';
import { t } from '../../i18n';
import { SettingsPage } from './SettingsPage';

export default defineFeature({
  id: 'settings',
  name: 'feature.settings.name',
  description: 'feature.settings.description',
  icon: Settings,
  core: true,
  contributes: {
    routes: [{ path: '/settings', element: <SettingsPage /> }],
    commands: () => [
      {
        id: 'settings',
        label: t('nav.settings'),
        icon: <Settings className="size-4" />,
        keywords: t('palette.keywords.settings'),
        run: () => navigateTo('/settings'),
      },
    ],
    nav: [
      {
        id: 'settings',
        to: '/settings',
        label: 'nav.settings',
        icon: Settings,
        order: 100,
        placement: 'bottom',
      },
    ],
  },
});
