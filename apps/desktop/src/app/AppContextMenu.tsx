import * as ContextMenu from '@radix-ui/react-context-menu';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowLeft,
  ArrowRight,
  ClipboardPaste,
  Command,
  Compass,
  Copy,
  ExternalLink,
  Home,
  Library,
  ListMusic,
  Maximize2,
  Mic,
  MicVocal,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Scissors,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  TextSelect,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '../i18n';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';
import { ContextEntries, menuContent, type MenuEntry } from './components/menu';
import { useUiStore } from './uiStore';

type Editable = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

type Ctx =
  | { kind: 'page' }
  | { kind: 'player' }
  | { kind: 'link'; href: string }
  | { kind: 'selection'; text: string }
  | { kind: 'edit'; el: Editable; hasSelection: boolean; readOnly: boolean }
  /** Inside another menu: do nothing, but keep the browser's own menu away. */
  | { kind: 'none' };

const TEXT_INPUTS = new Set(['text', 'search', 'url', 'email', 'password', 'tel', 'number']);

function describe(target: EventTarget | null): Ctx {
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
function mod(): string {
  return document.documentElement.dataset['platform'] === 'macos' ? '⌘' : 'Ctrl+';
}

/**
 * Editing commands on the focused field. execCommand is deprecated, but it is still the one way to
 * cut, copy and insert text that keeps undo and framework input handlers working in every webview.
 */
function exec(cmd: 'cut' | 'copy' | 'insertText' | 'selectAll', value?: string): void {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  document.execCommand(cmd, false, value);
}

function runCommand(cmd: 'cut' | 'copy'): void {
  exec(cmd);
}

async function paste(el: Editable): Promise<void> {
  try {
    const text = await navigator.clipboard.readText();
    el.focus();
    exec('insertText', text);
  } catch {
    /* clipboard access denied: nothing sensible to do */
  }
}

function Shell({
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
function usePlaybackEntries(): MenuEntry[] {
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

const sep = (key: string): MenuEntry => ({ key, separator: true });

/** Right-click anywhere in the main window: it offers what makes sense for what was clicked. */
export function AppContextMenu({ children }: { children: ReactNode }) {
  const t = useT();
  const navigate = useNavigate();
  const track = usePlayerStore((s) => s.track);
  const playback = usePlaybackEntries();
  const ui = useUiStore.getState;

  const go = (to: string) => () => {
    void navigate(to);
  };
  const entriesFor = (ctx: Ctx): MenuEntry[] => {
    if (ctx.kind === 'none') return [];
    if (ctx.kind === 'edit') {
      const { el, hasSelection, readOnly } = ctx;
      return [
        {
          key: 'cut',
          label: t('ctx.cut'),
          icon: <Scissors />,
          hint: `${mod()}X`,
          disabled: !hasSelection || readOnly,
          run: () => {
            el.focus();
            runCommand('cut');
          },
        },
        {
          key: 'copy',
          label: t('ctx.copy'),
          icon: <Copy />,
          hint: `${mod()}C`,
          disabled: !hasSelection,
          run: () => {
            el.focus();
            runCommand('copy');
          },
        },
        {
          key: 'paste',
          label: t('ctx.paste'),
          icon: <ClipboardPaste />,
          hint: `${mod()}V`,
          disabled: readOnly,
          run: () => paste(el),
        },
        sep('s1'),
        {
          key: 'all',
          label: t('ctx.selectAll'),
          icon: <TextSelect />,
          hint: `${mod()}A`,
          run: () => {
            el.focus();
            if ('select' in el && typeof el.select === 'function') el.select();
            else exec('selectAll');
          },
        },
      ];
    }
    if (ctx.kind === 'selection')
      return [
        {
          key: 'copy',
          label: t('ctx.copy'),
          icon: <Copy />,
          hint: `${mod()}C`,
          run: () => runCommand('copy'),
        },
        {
          key: 'search',
          label: t('ctx.searchFor', {
            text: ctx.text.length > 40 ? `${ctx.text.slice(0, 40)}…` : ctx.text,
          }),
          icon: <Search />,
          run: go(`/search?q=${encodeURIComponent(ctx.text.slice(0, 200))}`),
        },
      ];

    const entries: MenuEntry[] = [];
    if (ctx.kind === 'link')
      entries.push(
        { key: 'open', label: t('ctx.open'), icon: <ExternalLink />, run: go(ctx.href) },
        sep('s-link'),
      );
    if (playback.length > 0) {
      entries.push({ key: 'h-playback', heading: t('ctx.playback') }, ...playback, sep('s-play'));
    }
    const views: MenuEntry[] = [
      {
        key: 'queue',
        label: t('nav.queue'),
        icon: <ListMusic />,
        run: () => ui().toggleRightPanel('queue'),
      },
      {
        key: 'lyrics',
        label: t('nav.lyrics'),
        icon: <MicVocal />,
        run: () => ui().toggleRightPanel('lyrics'),
      },
    ];
    if (track)
      views.push(
        {
          key: 'now',
          label: t('player.nowPlaying'),
          icon: <Maximize2 />,
          run: () => ui().setNowPlayingOpen(true),
        },
        {
          key: 'karaoke',
          label: t('karaoke.open'),
          icon: <Mic />,
          run: () => ui().setKaraokeOpen(true),
        },
      );
    views.push({
      key: 'mini',
      label: t('player.miniPlayer'),
      icon: <PictureInPicture2 />,
      run: () => void invoke('open_mini_player'),
    });
    entries.push(
      { key: 'back', label: t('nav.back'), icon: <ArrowLeft />, run: () => void navigate(-1) },
      {
        key: 'forward',
        label: t('nav.forward'),
        icon: <ArrowRight />,
        run: () => void navigate(1),
      },
      {
        key: 'go',
        label: t('ctx.goTo'),
        icon: <Compass />,
        submenu: [
          { key: 'home', label: t('nav.home'), icon: <Home />, run: go('/') },
          { key: 'explore', label: t('nav.explore'), icon: <Compass />, run: go('/explore') },
          { key: 'library', label: t('nav.library'), icon: <Library />, run: go('/library') },
          {
            key: 'search',
            label: t('ctx.search'),
            icon: <Search />,
            hint: `${mod()}F`,
            run: () => document.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus(),
          },
        ],
      },
      { key: 'view', label: t('ctx.view'), icon: <Maximize2 />, submenu: views },
      sep('s-end'),
      {
        key: 'palette',
        label: t('ctx.palette'),
        icon: <Command />,
        hint: `${mod()}K`,
        run: () => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
        },
      },
      { key: 'settings', label: t('nav.settings'), icon: <Settings />, run: go('/settings') },
    );
    return entries;
  };

  return <Shell entriesFor={entriesFor}>{children}</Shell>;
}

/** The mini player's right-click menu: just the playback controls. */
export function MiniContextMenu({ children }: { children: ReactNode }) {
  const playback = usePlaybackEntries();
  return <Shell entriesFor={() => playback}>{children}</Shell>;
}
