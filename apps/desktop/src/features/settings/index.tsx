import { Settings } from 'lucide-react';
import { defineFeature, navigateTo } from '../../core';
import { t } from '../../i18n';
import { AppearanceSection } from './AppearanceSection';
import { SettingsPage } from './SettingsPage';
import { AboutSection } from './sections/AboutSection';
import { DesktopSection } from './sections/DesktopSection';
import { FeaturesSection } from './sections/FeaturesSection';
import { UpdatesSection } from './sections/UpdatesSection';

export default defineFeature({
  id: 'settings',
  name: 'feature.settings.name',
  description: 'feature.settings.description',
  icon: Settings,
  core: true,
  contributes: {
    // Other features add their own sections (Shortcuts at 40, Storage at 50, Plugins at 60).
    settings: [
      { id: 'appearance', category: 'appearance', order: 20, component: AppearanceSection },
      { id: 'desktop', category: 'general', order: 30, component: DesktopSection },
      { id: 'features', category: 'features', order: 45, component: FeaturesSection },
      { id: 'updates', category: 'about', order: 70, component: UpdatesSection },
      { id: 'about', category: 'about', order: 90, component: AboutSection },
    ],
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
