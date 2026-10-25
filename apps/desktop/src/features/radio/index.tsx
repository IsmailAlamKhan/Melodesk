import { Radio } from 'lucide-react';
import { defineFeature, navigateTo } from '../../core';
import { t } from '../../i18n';
import { RadioPage } from './RadioPage';
import { loadStations } from './stations';

/**
 * Internet radio: add stations by their stream address (or find them in the radio-browser.info
 * directory) and play them in the local player. It needs the Local music feature, which provides that
 * player; a station is relayed to it through a small address on this computer.
 */
export default defineFeature({
  id: 'radio',
  name: 'feature.radio.name',
  description: 'feature.radio.description',
  icon: Radio,
  dependsOn: ['local-music'],
  contributes: {
    routes: [{ path: '/radio', element: <RadioPage /> }],
    nav: [{ id: 'radio', to: '/radio', label: 'nav.radio', icon: Radio, order: 38 }],
    commands: () => [
      {
        id: 'radio',
        label: t('palette.cmd.radio'),
        icon: <Radio className="size-4" />,
        keywords: 'station stream live',
        run: () => navigateTo('/radio'),
      },
    ],
  },
  start: () => {
    void loadStations();
  },
});
