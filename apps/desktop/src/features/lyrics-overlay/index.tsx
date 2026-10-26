import { IconButton } from '@melodesk/ui';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Captions } from 'lucide-react';
import { defineFeature } from '../../core';
import { t, useT } from '../../i18n';
import { OverlayEmitter } from './Emitter';
import { OverlayWindow } from './OverlayWindow';
import { CLOSED_EVENT } from './protocol';
import { useOverlay } from './store';

const open = (): void => {
  useOverlay.getState().setOpen(true);
  void invoke('open_lyrics_overlay');
};

function OverlayButton() {
  const t = useT();
  return (
    <IconButton label={t('overlay.open')} size="sm" onClick={open}>
      <Captions />
    </IconButton>
  );
}

/** Whether this is the main window (this feature also runs in the overlay's own window). */
const isMain = (): boolean =>
  typeof window === 'undefined' ||
  new URLSearchParams(window.location.search).get('window') === null;

/** A floating window with the line being sung, kept on top of other windows. */
export default defineFeature({
  id: 'lyrics-overlay',
  name: 'feature.lyricsOverlay.name',
  description: 'feature.lyricsOverlay.description',
  icon: Captions,
  dependsOn: ['lyrics'],
  scope: 'all',
  contributes: {
    windows: { lyrics: OverlayWindow },
    ...(isMain()
      ? {
          overlays: [{ id: 'emitter', component: OverlayEmitter }],
          slots: { 'lyrics.toolbar': [{ id: 'overlay', order: 60, component: OverlayButton }] },
          commands: () => [
            {
              id: 'lyrics-overlay',
              label: t('palette.cmd.lyricsOverlay'),
              icon: <Captions className="size-4" />,
              run: open,
            },
          ],
        }
      : {}),
  },
  start: () => {
    if (!isMain()) return undefined;
    let off: (() => void) | undefined;
    void listen(CLOSED_EVENT, () => {
      useOverlay.getState().setOpen(false);
    }).then((u) => {
      off = u;
    });
    return () => {
      off?.();
      useOverlay.getState().setOpen(false);
    };
  },
});
