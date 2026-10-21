import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { useT } from '../../i18n/index';
import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { ContextEntries, menuContent, type MenuEntry } from './menu';

export type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export type Ctx =
  | { kind: 'page' }
  | { kind: 'player' }
  | { kind: 'link'; href: string }
  | { kind: 'selection'; text: string }
  | { kind: 'edit'; el: Editable; hasSelection: boolean; readOnly: boolean }
  /** Inside another menu: do nothing, but keep the browser's own menu away. */
  | { kind: 'none' };

const TEXT_INPUTS = new Set(['text', 'search', 'url', 'email', 'password', 'tel', 'number']);

export function describe(target: EventTarget | null): Ctx {
  if (!(target instanceof HTMLElement)) return { kind: 'page' };
  if (target.closest('[role="menu"], [data-radix-popper-content-wrapper]')) return { kind: 'none' };
  const field = target.closest('input, textarea, [contenteditable="true"]');
  if (field instanceof HTMLInputElement && TEXT_INPUTS.has(field.type))
    return {
      kind: 'edit',
      el: field,
      hasSelection: field.selectionStart !== field.selectionEnd,
      readOnly: field.readOnly || field.disabled,
    };
  if (field instanceof HTMLTextAreaElement)
    return {
      kind: 'edit',
      el: field,
      hasSelection: field.selectionStart !== field.selectionEnd,
      readOnly: field.readOnly || field.disabled,
    };
  if (field instanceof HTMLElement && field.isContentEditable)
    return {
      kind: 'edit',
      el: field,
      hasSelection: (window.getSelection()?.toString() ?? '') !== '',
      readOnly: false,
    };
  const selected = window.getSelection()?.toString().trim() ?? '';
  if (selected) return { kind: 'selection', text: selected };
  const link = target.closest('a[href]');
  if (link instanceof HTMLAnchorElement) {
    const href = link.getAttribute('href') ?? '';
    if (href.startsWith('/')) return { kind: 'link', href };
  }
  if (target.closest('footer[aria-label]')) return { kind: 'player' };
  return { kind: 'page' };
}

/** "⌘" on macOS, "Ctrl+" elsewhere (the platform is set on <html> at startup). */
export function mod(): string {
  return document.documentElement.dataset['platform'] === 'macos' ? '⌘' : 'Ctrl+';
}

/**
 * Editing commands on the focused field. execCommand is deprecated, but it is still the one way to
 * cut, copy and insert text that keeps undo and framework input handlers working in every webview.
 */
export function exec(cmd: 'cut' | 'copy' | 'insertText' | 'selectAll', value?: string): void {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  document.execCommand(cmd, false, value);
}

export function runCommand(cmd: 'cut' | 'copy'): void {
  exec(cmd);
}

export async function paste(el: Editable): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    el.focus();
    exec('insertText', text);
  } catch {
    /* clipboard access denied: nothing sensible to do */
  }
}

export function Shell({
  children,
  entriesFor,
}: {
  children: ReactNode;
  entriesFor: (ctx: Ctx) => MenuEntry[];
}) {
  const [ctx, setCtx] = useState<Ctx>({ kind: 'page' });
  const onContextMenu = (e: MouseEvent): void => {
    // A more specific menu (a song card, a queue row…) already took this click.
    if (e.defaultPrevented) return;
    const next = describe(e.target);
    setCtx(next);
    // Never show the browser's own menu (Reload, Inspect…), even where we have nothing to offer.
    if (next.kind === 'none') e.preventDefault();
  };
  const entries = entriesFor(ctx);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild onContextMenu={onContextMenu}>
        <div className="contents">{children}</div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContent} collisionPadding={8}>
          <ContextEntries entries={entries} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** Playback entries for the current track, shared by the app menu and the mini player's. */
export function usePlaybackEntries(): MenuEntry[] {
  const t = useT();
  const track = usePlayerStore((s) => s.track);
  const state = usePlayerStore((s) => s.state);
  const queue = usePlayerStore((s) => s.queue);
  if (!track) return [];
  const playing = state?.playing ?? false;
  const muted = state?.muted ?? false;
  const shuffle = queue?.shuffle ?? false;
  return [
    {
      key: 'toggle',
      label: playing ? t('player.pause') : t('player.play'),
      icon: playing ? <Pause /> : <Play />,
      hint: 'Space',
      run: () => sendCommand({ type: 'toggle' }),
    },
    {
      key: 'next',
      label: t('player.next'),
      icon: <SkipForward />,
      run: () => sendCommand({ type: 'next' }),
    },
    {
      key: 'previous',
      label: t('player.previous'),
      icon: <SkipBack />,
      run: () => sendCommand({ type: 'previous' }),
    },
    {
      key: 'shuffle',
      label: shuffle ? t('ctx.shuffleOff') : t('ctx.shuffleOn'),
      icon: <Shuffle />,
      run: () => sendCommand({ type: 'setShuffle', enabled: !shuffle }),
    },
    {
      key: 'repeat',
      label: t('ctx.repeatCycle'),
      icon: <Repeat />,
      run: () =>
        sendCommand({
          type: 'setRepeat',
          mode: !queue || queue.repeat === 'off' ? 'all' : queue.repeat === 'all' ? 'one' : 'off',
        }),
    },
    {
      key: 'mute',
      label: muted ? t('player.unmute') : t('player.mute'),
      icon: muted ? <VolumeX /> : <Volume2 />,
      run: () => sendCommand({ type: 'setMuted', muted: !muted }),
    },
  ];
}

export const sep = (key: string): MenuEntry => ({ key, separator: true });

/** The mini player's right-click menu: just the playback controls. */
export function MiniContextMenu({ children }: { children: ReactNode }) {
  const playback = usePlaybackEntries();
  return <Shell entriesFor={() => playback}>{children}</Shell>;
}
