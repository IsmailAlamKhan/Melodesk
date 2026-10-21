import { IconButton } from '@melodesk/ui';
import { invoke } from '@tauri-apps/api/core';
import { PictureInPicture2 } from 'lucide-react';
import { defineFeature } from '../../core';
import { t, useT } from '../../i18n';
import { MiniPlayer } from './MiniPlayer';

const open = (): void => void invoke('open_mini_player');

function MiniPlayerButton() {
  const t = useT();
  return (
    <IconButton label={t('player.miniPlayer')} size="sm" onClick={open}>
      <PictureInPicture2 />
    </IconButton>
  );
}

export default defineFeature({
  id: 'mini-player',
  name: 'feature.mini-player.name',
  description: 'feature.mini-player.description',
  icon: PictureInPicture2,
  // The mini window is its own webview, so it needs to know this feature too.
  scope: 'all',
  contributes: {
    windows: { mini: MiniPlayer },
    slots: { 'playerBar.end': [{ id: 'button', order: 10, component: MiniPlayerButton }] },
    commands: () => [
      {
        id: 'mini',
        label: t('palette.cmd.mini'),
        icon: <PictureInPicture2 className="size-4" />,
        run: open,
      },
    ],
    menus: [
      {
        menu: 'view',
        order: 50,
        entries: () => [
          { key: 'mini', label: t('player.miniPlayer'), icon: <PictureInPicture2 />, run: open },
        ],
      },
    ],
  },
});
