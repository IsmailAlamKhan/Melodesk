import { IconButton } from '@melodesk/ui';
import { Mic, MicVocal } from 'lucide-react';
import { defineFeature, registerAction } from '../../core';
import { t, useT } from '../../i18n';
import { KaraokeView } from './KaraokeView';
import { useKaraoke } from './store';

const open = (): void => useKaraoke.getState().setOpen(true);

/** In the Now Playing header. */
function HeaderButton() {
  const t = useT();
  return (
    <IconButton label={t('karaoke.open')} onClick={open}>
      <MicVocal />
    </IconButton>
  );
}

/** In the lyrics toolbar; hidden while karaoke itself is open. */
function ToolbarButton() {
  const t = useT();
  const isOpen = useKaraoke((s) => s.open);
  if (isOpen) return null;
  return (
    <IconButton label={t('karaoke.open')} size="sm" onClick={open}>
      <MicVocal />
    </IconButton>
  );
}

export default defineFeature({
  id: 'karaoke',
  name: 'feature.karaoke.name',
  description: 'feature.karaoke.description',
  icon: Mic,
  dependsOn: ['lyrics'],
  contributes: {
    overlays: [{ id: 'view', order: 20, component: KaraokeView }],
    slots: {
      'nowPlaying.header': [{ id: 'button', order: 10, component: HeaderButton }],
      'lyrics.toolbar': [{ id: 'button', order: 50, component: ToolbarButton }],
    },
    commands: () => [
      {
        id: 'karaoke',
        label: t('palette.cmd.karaoke'),
        icon: <Mic className="size-4" />,
        run: open,
      },
    ],
    menus: [
      {
        menu: 'view',
        order: 40,
        entries: (ctx) =>
          ctx.hasTrack
            ? [{ key: 'karaoke', label: t('karaoke.open'), icon: <Mic />, run: open }]
            : [],
      },
    ],
  },
  start: () => {
    const off = registerAction('karaoke.open', open);
    return () => {
      off();
      useKaraoke.getState().setOpen(false);
    };
  },
});
