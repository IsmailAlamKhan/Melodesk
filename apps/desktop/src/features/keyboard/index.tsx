import { Keyboard } from 'lucide-react';
import { defineFeature, registerAction } from '../../core';
import { t } from '../../i18n';
import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { Cheatsheet, useCheatsheet } from './Cheatsheet';
import { focusKeepsKey, keyAction, type KeyAction } from './keys';

function perform(action: KeyAction): void {
  const { state, queue } = usePlayerStore.getState();
  switch (action.type) {
    case 'toggle':
    case 'next':
    case 'previous':
      void sendCommand({ type: action.type });
      break;
    case 'seek': {
      if (!state || !(state.duration > 0)) return;
      const now =
        state.position + (state.playing ? Math.max(0, Date.now() - state.sampledAt) / 1000 : 0);
      void sendCommand({
        type: 'seek',
        seconds: Math.min(state.duration, Math.max(0, now + action.seconds)),
      });
      break;
    }
    case 'volume': {
      const next = Math.min(1, Math.max(0, (state?.volume ?? 1) + action.delta));
      void sendCommand({ type: 'setVolume', volume: Math.round(next * 100) / 100 });
      break;
    }
    case 'mute':
      void sendCommand({ type: 'setMuted', muted: !(state?.muted ?? false) });
      break;
    case 'shuffle':
      void sendCommand({ type: 'setShuffle', enabled: !(queue?.shuffle ?? false) });
      break;
    case 'repeat':
      void sendCommand({
        type: 'setRepeat',
        mode: !queue || queue.repeat === 'off' ? 'all' : queue.repeat === 'all' ? 'one' : 'off',
      });
      break;
    case 'help':
      useCheatsheet.getState().setOpen(true);
      break;
  }
}

/**
 * Keys that work anywhere in the app, such as Space for play and pause, as long as what has focus
 * does not use the key itself (a text field, a slider, a button, a menu). Overlays that handle keys
 * in the capture phase (Now Playing, karaoke) get them first and the rest steps aside.
 */
export default defineFeature({
  id: 'keyboard',
  name: 'feature.keyboard.name',
  description: 'feature.keyboard.description',
  icon: Keyboard,
  contributes: {
    overlays: [{ id: 'cheatsheet', component: Cheatsheet }],
    commands: () => [
      {
        id: 'keyboard-shortcuts',
        label: t('keys.title'),
        icon: <Keyboard className="size-4" />,
        keywords: 'keys hotkeys cheat sheet',
        run: () => useCheatsheet.getState().setOpen(true),
      },
    ],
  },
  start: () => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.repeat) return;
      const action = keyAction(e);
      if (!action || focusKeepsKey(e.target)) return;
      e.preventDefault();
      perform(action);
    };
    window.addEventListener('keydown', onKey);
    const off = registerAction('keyboard.help', () => useCheatsheet.getState().setOpen(true));
    return () => {
      window.removeEventListener('keydown', onKey);
      off();
    };
  },
});
