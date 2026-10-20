import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@melodesk/ui';
import { invoke } from '@tauri-apps/api/core';
import {
  BarChart3,
  Compass,
  Home,
  Library,
  ListMusic,
  Maximize2,
  MicVocal,
  Pause,
  PictureInPicture2,
  Play,
  Plus,
  Repeat,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useSuggestions } from '../data/hooks';
import { playItem, routeForEndpoint } from '../player/actions';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';
import { Artwork } from './components/Artwork';
import { openDialog } from './dialogs/store';
import { useUiStore } from './uiStore';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

/** Cmd/Ctrl+K: navigate, control playback, and search from the keyboard. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const playing = usePlayerStore((s) => s.state?.playing ?? false);
  const queue = usePlayerStore((s) => s.queue);
  const toggleRightPanel = useUiStore((s) => s.toggleRightPanel);
  const setNowPlayingOpen = useUiStore((s) => s.setNowPlayingOpen);
  const suggestions = useSuggestions(open && query.trim().length > 1 ? query.trim() : '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (to: string): void => {
    setOpen(false);
    void navigate(to);
  };
  const commands = useMemo<Command[]>(
    () => [
      { id: 'home', label: 'Go to Home', icon: <Home className="size-4" />, run: () => go('/') },
      {
        id: 'explore',
        label: 'Go to Explore',
        icon: <Compass className="size-4" />,
        run: () => go('/explore'),
      },
      {
        id: 'library',
        label: 'Go to Library',
        icon: <Library className="size-4" />,
        keywords: 'playlists songs albums artists',
        run: () => go('/library'),
      },
      {
        id: 'history',
        label: 'Go to History',
        icon: <Library className="size-4" />,
        run: () => go('/library/history'),
      },
      {
        id: 'liked',
        label: 'Open Liked Music',
        icon: <Library className="size-4" />,
        run: () => go('/playlist/LM'),
      },
      {
        id: 'stats',
        label: 'Your listening stats',
        icon: <BarChart3 className="size-4" />,
        run: () => go('/stats'),
      },
      {
        id: 'settings',
        label: 'Settings',
        icon: <Settings className="size-4" />,
        keywords: 'plugins shortcuts account',
        run: () => go('/settings'),
      },
      {
        id: 'toggle',
        label: playing ? 'Pause' : 'Play',
        hint: 'Space',
        icon: playing ? <Pause className="size-4" /> : <Play className="size-4" />,
        run: () => void sendCommand({ type: 'toggle' }),
      },
      {
        id: 'next',
        label: 'Next track',
        icon: <SkipForward className="size-4" />,
        run: () => void sendCommand({ type: 'next' }),
      },
      {
        id: 'previous',
        label: 'Previous track',
        icon: <SkipBack className="size-4" />,
        run: () => void sendCommand({ type: 'previous' }),
      },
      {
        id: 'shuffle',
        label: queue?.shuffle ? 'Shuffle off' : 'Shuffle on',
        icon: <Shuffle className="size-4" />,
        run: () => void sendCommand({ type: 'setShuffle', enabled: !(queue?.shuffle ?? false) }),
      },
      {
        id: 'repeat',
        label: 'Cycle repeat',
        hint: queue?.repeat ?? 'off',
        icon: <Repeat className="size-4" />,
        run: () =>
          void sendCommand({
            type: 'setRepeat',
            mode: !queue || queue.repeat === 'off' ? 'all' : queue.repeat === 'all' ? 'one' : 'off',
          }),
      },
      {
        id: 'queue',
        label: 'Toggle queue panel',
        icon: <ListMusic className="size-4" />,
        run: () => toggleRightPanel('queue'),
      },
      {
        id: 'lyrics',
        label: 'Toggle lyrics panel',
        icon: <MicVocal className="size-4" />,
        run: () => toggleRightPanel('lyrics'),
      },
      {
        id: 'nowplaying',
        label: 'Open Now Playing',
        icon: <Maximize2 className="size-4" />,
        run: () => setNowPlayingOpen(true),
      },
      {
        id: 'mini',
        label: 'Open mini player',
        icon: <PictureInPicture2 className="size-4" />,
        run: () => void invoke('open_mini_player'),
      },
      {
        id: 'newplaylist',
        label: 'New playlist',
        icon: <Plus className="size-4" />,
        run: () => openDialog({ type: 'createPlaylist' }),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `go` is stable enough; commands depend on playback flags
    [playing, queue?.shuffle, queue?.repeat],
  );

  const q = query.trim().toLowerCase();
  const matches = q
    ? commands.filter((c) => `${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(q))
    : commands;
  const entities = (suggestions.data ?? []).filter((s) => s.item).slice(0, 5);
  const total = matches.length + entities.length + (q ? 1 : 0);

  const choose = (i: number): void => {
    if (i < matches.length) {
      matches[i]?.run();
      setOpen(false);
      return;
    }
    const e = entities[i - matches.length];
    if (e?.item) {
      const route = routeForEndpoint(e.item.endpoint);
      setOpen(false);
      if (route) void navigate(route);
      else void playItem(e.item);
      return;
    }
    if (q) go(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setQuery('');
          setActive(0);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-label="Command palette"
          className="fixed top-[12vh] left-1/2 z-50 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl focus:outline-none"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-fg-subtle" />
            <input
              ref={input}
              autoFocus
              value={query}
              placeholder="Type a command or search…"
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, total - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter') choose(active);
              }}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
            />
            <kbd className="rounded border border-border px-1.5 text-[10px] text-fg-subtle">
              esc
            </kbd>
          </div>
          <ul role="listbox" className="max-h-[50vh] overflow-y-auto p-1">
            {matches.map((c, i) => (
              <Row
                key={c.id}
                active={i === active}
                onClick={() => choose(i)}
                onHover={() => setActive(i)}
              >
                <span className="text-fg-muted">{c.icon}</span>
                <span className="flex-1 truncate">{c.label}</span>
                {c.hint && <span className="text-xs text-fg-subtle">{c.hint}</span>}
              </Row>
            ))}
            {entities.map((e, i) => (
              <Row
                key={`${e.type}-${e.text}`}
                active={matches.length + i === active}
                onClick={() => choose(matches.length + i)}
                onHover={() => setActive(matches.length + i)}
              >
                {e.item && (
                  <Artwork
                    thumbnails={e.item.thumbnails}
                    size={24}
                    round={e.item.kind === 'artist'}
                  />
                )}
                <span className="flex-1 truncate">{e.text}</span>
                <span className="text-xs text-fg-subtle">{e.item?.kind}</span>
              </Row>
            ))}
            {q && (
              <Row
                active={total - 1 === active}
                onClick={() => choose(total - 1)}
                onHover={() => setActive(total - 1)}
              >
                <Search className="size-4 text-fg-muted" />
                <span className="flex-1 truncate">Search for “{q}”</span>
              </Row>
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({
  active,
  onClick,
  onHover,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onHover: () => void;
  children: ReactNode;
}) {
  return (
    <li role="option" aria-selected={active}>
      <button
        type="button"
        onMouseEnter={onHover}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm',
          active && 'bg-bg-overlay',
        )}
      >
        {children}
      </button>
    </li>
  );
}
