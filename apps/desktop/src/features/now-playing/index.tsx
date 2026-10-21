import { Maximize2 } from 'lucide-react';
import { IconButton } from '@melodesk/ui';
import { defineFeature, registerAction } from '../../core';
import { t, useT } from '../../i18n';
import { usePlayerStore } from '../../player/store';
import { NowPlayingView } from './NowPlayingView';
import { useNowPlaying } from './store';

function NowPlayingButton() {
  const t = useT();
  const hasTrack = usePlayerStore((s) => s.track !== null);
  return (
    <IconButton
      label={t('player.nowPlaying')}
      size="sm"
      disabled={!hasTrack}
      onClick={() => useNowPlaying.getState().setOpen(true)}
    >
      <Maximize2 />
    </IconButton>
  );
}

export default defineFeature({
  id: 'now-playing',
  name: 'feature.now-playing.name',
  description: 'feature.now-playing.description',
  icon: Maximize2,
  contributes: {
    overlays: [{ id: 'view', component: NowPlayingView }],
    slots: { 'playerBar.end': [{ id: 'button', order: 20, component: NowPlayingButton }] },
    commands: () => [
      {
        id: 'nowplaying',
        label: t('palette.cmd.nowPlaying'),
        icon: <Maximize2 className="size-4" />,
        run: () => useNowPlaying.getState().setOpen(true),
      },
    ],
    menus: [
      {
        menu: 'view',
        order: 30,
        entries: (ctx) =>
          ctx.hasTrack
            ? [
                {
                  key: 'now-playing',
                  label: t('player.nowPlaying'),
                  icon: <Maximize2 />,
                  run: () => useNowPlaying.getState().setOpen(true),
                },
              ]
            : [],
      },
    ],
  },
  start: () => {
    const offOpen = registerAction('nowPlaying.open', () => useNowPlaying.getState().setOpen(true));
    const offClose = registerAction('nowPlaying.close', () =>
      useNowPlaying.getState().setOpen(false),
    );
    return () => {
      offOpen();
      offClose();
      useNowPlaying.getState().setOpen(false);
    };
  },
});
