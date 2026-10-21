import type { MessageKey } from '../../i18n';

/** What a key press asks for. Seek and volume are steps from where they are now. */
export type KeyAction =
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; seconds: number }
  | { type: 'volume'; delta: number }
  | { type: 'mute' }
  | { type: 'shuffle' }
  | { type: 'repeat' }
  | { type: 'help' };

export const SEEK_STEP_S = 5;
export const VOLUME_STEP = 0.05;

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

/** The action for a plain key press (no Cmd, Ctrl or Alt), or null. */
export function keyAction(e: KeyLike): KeyAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  switch (e.key) {
    case ' ':
      return { type: 'toggle' };
    case 'ArrowRight':
      return { type: 'seek', seconds: SEEK_STEP_S };
    case 'ArrowLeft':
      return { type: 'seek', seconds: -SEEK_STEP_S };
    case 'ArrowUp':
      return { type: 'volume', delta: VOLUME_STEP };
    case 'ArrowDown':
      return { type: 'volume', delta: -VOLUME_STEP };
    case 'n':
    case 'N':
      return { type: 'next' };
    case 'p':
    case 'P':
      return { type: 'previous' };
    case 'm':
    case 'M':
      return { type: 'mute' };
    case 's':
    case 'S':
      return { type: 'shuffle' };
    case 'r':
    case 'R':
      return { type: 'repeat' };
    case '?':
      return { type: 'help' };
    default:
      return null;
  }
}

/**
 * Whether the key belongs to what has focus rather than to the player: text fields, sliders,
 * buttons (Space presses them), menus, lists and dialogs all use these keys themselves.
 */
export function focusKeepsKey(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea, select, button, a[href], [contenteditable="true"]'))
    return true;
  return (
    target.closest(
      '[role="slider"], [role="combobox"], [role="option"], [role="listbox"], [role="menu"], [role="menuitem"], [role="dialog"], [role="tab"], [role="radio"], [role="switch"], [role="row"]',
    ) !== null
  );
}

export interface ShortcutRow {
  keys: string[];
  label: MessageKey;
}

/** What the cheat sheet lists, in groups. `mod` is the platform's Cmd or Ctrl. */
export function shortcutGroups(mod: string): { title: MessageKey; rows: ShortcutRow[] }[] {
  return [
    {
      title: 'keys.group.playback',
      rows: [
        { keys: ['Space'], label: 'keys.toggle' },
        { keys: ['←', '→'], label: 'keys.seek' },
        { keys: ['↑', '↓'], label: 'keys.volume' },
        { keys: ['N', 'P'], label: 'keys.nextPrevious' },
        { keys: ['M'], label: 'keys.mute' },
        { keys: ['S'], label: 'keys.shuffle' },
        { keys: ['R'], label: 'keys.repeat' },
      ],
    },
    {
      title: 'keys.group.app',
      rows: [
        { keys: [`${mod}K`], label: 'keys.palette' },
        { keys: [`${mod}F`], label: 'keys.search' },
        { keys: ['Esc'], label: 'keys.close' },
        { keys: ['?'], label: 'keys.help' },
      ],
    },
  ];
}
