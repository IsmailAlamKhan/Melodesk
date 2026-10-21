import { Command } from 'lucide-react';
import { defineFeature, registerAction } from '../../core';
import { t } from '../../i18n';
import { CommandPalette } from './CommandPalette';
import { usePalette } from './store';

const modKey = (): string =>
  document.documentElement.dataset['platform'] === 'macos' ? '⌘' : 'Ctrl+';

export default defineFeature({
  id: 'command-palette',
  name: 'feature.command-palette.name',
  description: 'feature.command-palette.description',
  icon: Command,
  contributes: {
    overlays: [{ id: 'palette', component: CommandPalette }],
    menus: [
      {
        menu: 'root',
        order: 10,
        entries: () => [
          {
            key: 'palette',
            label: t('ctx.palette'),
            icon: <Command />,
            hint: `${modKey()}K`,
            run: () => usePalette.getState().setOpen(true),
          },
        ],
      },
    ],
  },
  start: () => registerAction('palette.open', () => usePalette.getState().setOpen(true)),
});
