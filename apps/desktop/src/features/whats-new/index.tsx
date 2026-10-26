import { getVersion } from '@tauri-apps/api/app';
import { Gift } from 'lucide-react';
import { defineFeature } from '../../core';
import { t } from '../../i18n';
import { AutoOpen } from './AutoOpen';
import { releasesUpTo } from './logic';
import { RELEASES } from './releases';
import { useWhatsNew } from './store';
import { WhatsNewDialog } from './WhatsNewDialog';
import { WhatsNewSection } from './WhatsNewSection';

/** Open the window with everything that was added up to the version that is running. */
const open = (): void => {
  void getVersion()
    .catch(() => '999.0.0')
    .then((current) => {
      useWhatsNew.getState().show(releasesUpTo(RELEASES, current), false);
    });
};

/** A "What's new" window: shown once after an update, and any time from the View menu or the palette. */
export default defineFeature({
  id: 'whats-new',
  name: 'feature.whatsNew.name',
  description: 'feature.whatsNew.description',
  icon: Gift,
  contributes: {
    settings: [{ id: 'whats-new', category: 'about', order: 85, component: WhatsNewSection }],
    overlays: [
      { id: 'auto', component: AutoOpen },
      { id: 'dialog', component: WhatsNewDialog },
    ],
    commands: () => [
      {
        id: 'whats-new',
        label: t('palette.cmd.whatsNew'),
        icon: <Gift className="size-4" />,
        run: open,
      },
    ],
    menus: [
      {
        menu: 'view',
        order: 90,
        entries: () => [
          { key: 'whats-new', label: t('whatsNew.title'), icon: <Gift />, run: open },
        ],
      },
    ],
  },
});
