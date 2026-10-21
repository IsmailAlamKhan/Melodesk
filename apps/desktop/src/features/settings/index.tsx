import { Settings } from 'lucide-react';
import { defineFeature } from '../../core';
import { SettingsPage } from './SettingsPage';

export default defineFeature({
  id: 'settings',
  name: 'feature.settings.name',
  description: 'feature.settings.description',
  icon: Settings,
  core: true,
  contributes: {
    routes: [{ path: '/settings', element: <SettingsPage /> }],
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
