import { ListMusic } from 'lucide-react';
import { useUiStore } from '../../app/uiStore';
import { defineFeature } from '../../core';
import { t } from '../../i18n';
import { QueuePanel } from './QueuePanel';

const toggle = (): void => useUiStore.getState().toggleRightPanel('queue');

export default defineFeature({
  id: 'queue',
  name: 'feature.queue.name',
  description: 'feature.queue.description',
  icon: ListMusic,
  contributes: {
    panels: [
      { id: 'queue', label: 'nav.queue', icon: ListMusic, order: 20, component: QueuePanel },
    ],
    commands: () => [
      {
        id: 'queue',
        label: t('palette.cmd.queue'),
        icon: <ListMusic className="size-4" />,
        run: toggle,
      },
    ],
    menus: [
      {
        menu: 'view',
        order: 10,
        entries: () => [{ key: 'queue', label: t('nav.queue'), icon: <ListMusic />, run: toggle }],
      },
    ],
  },
});
