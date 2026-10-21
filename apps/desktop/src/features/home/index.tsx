import { Home } from 'lucide-react';
import { defineFeature, navigateTo } from '../../core';
import { t } from '../../i18n';
import { HomePage } from './HomePage';

export default defineFeature({
  id: 'home',
  name: 'feature.home.name',
  description: 'feature.home.description',
  icon: Home,
  core: true,
  contributes: {
    routes: [{ path: '/', element: <HomePage /> }],
    commands: () => [
      {
        id: 'home',
        label: t('palette.cmd.home'),
        icon: <Home className="size-4" />,
        run: () => navigateTo('/'),
      },
    ],
    nav: [{ id: 'home', to: '/', label: 'nav.home', icon: Home, order: 10, end: true }],
  },
});
