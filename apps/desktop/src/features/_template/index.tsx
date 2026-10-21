/**
 * A starting point for a feature. Folders that start with "_" are ignored by the app; copy this
 * folder to `src/features/<your-id>/` (lowercase, dashes) and edit. See docs/extending.md.
 *
 * Delete what you do not need: a feature can be only a route, only a settings section, only a
 * background `start()`, or any mix.
 */
import { Sparkles } from 'lucide-react';
import { defineFeature, navigateTo } from '../../core';
import { t } from '../../i18n';
import { ExamplePage } from './ExamplePage';

export default defineFeature({
  id: 'template',
  // Message keys from src/i18n/locales/en.json; add `feature.<id>.name` and `.description` for yours.
  name: 'nav.home',
  description: 'nav.home',
  icon: Sparkles,
  // defaultEnabled: false,       // off until the user turns it on in Settings → Features
  // dependsOn: ['lyrics'],       // needed if you import from that feature's folder
  // requires: ['discord'],       // native modules (Cargo features) it cannot work without
  contributes: {
    routes: [{ path: '/template', element: <ExamplePage /> }],
    nav: [{ id: 'template', to: '/template', label: 'nav.home', icon: Sparkles, order: 90 }],
    commands: () => [
      {
        id: 'template',
        label: t('nav.home'),
        icon: <Sparkles className="size-4" />,
        run: () => navigateTo('/template'),
      },
    ],
  },
  // Runs while the feature is on. Return a function to undo what it did.
  start: () => {
    return () => undefined;
  },
});
