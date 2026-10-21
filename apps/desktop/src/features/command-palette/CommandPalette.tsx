import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@melodesk/ui';
import { Pause, Play, Repeat, Search, Shuffle, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSuggestions } from '../../data/hooks';
import { useI18n, useT } from '../../i18n/index';
import { playItem, routeForEndpoint } from '../../player/actions';
import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { Artwork } from '../../app/components/Artwork';
import { KIND_KEY } from '../../app/components/kinds';
import { navigateTo, useCommands, type PaletteCommand } from '../../core';
import { usePalette } from './store';

type Command = PaletteCommand;

/** Cmd/Ctrl+K: navigate, control playback, and search from the keyboard. */
export function CommandPalette() {
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const open = usePalette((st) => st.open);
  const setOpen = usePalette((st) => st.setOpen);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const playing = usePlayerStore((s) => s.state?.playing ?? false);
  const queue = usePlayerStore((s) => s.queue);
  const suggestions = useSuggestions(open && query.trim().length > 1 ? query.trim() : '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        usePalette.getState().toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (to: string): void => {
    setOpen(false);
    navigateTo(to);
  };
  const contributed = useCommands();
  const playback = useMemo<Command[]>(
    () => [
      {
        id: 'toggle',
        label: playing ? t('player.pause') : t('player.play'),
        hint: t('palette.hint.space'),
        icon: playing ? <Pause className="size-4" /> : <Play className="size-4" />,
        run: () => void sendCommand({ type: 'toggle' }),
      },
      {
        id: 'next',
        label: t('palette.cmd.next'),
        icon: <SkipForward className="size-4" />,
        run: () => void sendCommand({ type: 'next' }),
      },
      {
        id: 'previous',
        label: t('palette.cmd.previous'),
        icon: <SkipBack className="size-4" />,
        run: () => void sendCommand({ type: 'previous' }),
      },
      {
        id: 'shuffle',
        label: queue?.shuffle ? t('palette.cmd.shuffleOff') : t('palette.cmd.shuffleOn'),
        icon: <Shuffle className="size-4" />,
        run: () => void sendCommand({ type: 'setShuffle', enabled: !(queue?.shuffle ?? false) }),
      },
      {
        id: 'repeat',
        label: t('palette.cmd.repeat'),
        hint: t(
          queue?.repeat === 'one'
            ? 'palette.repeat.one'
            : queue?.repeat === 'all'
              ? 'palette.repeat.all'
              : 'palette.repeat.off',
        ),
        icon: <Repeat className="size-4" />,
        run: () =>
          void sendCommand({
            type: 'setRepeat',
            mode: !queue || queue.repeat === 'off' ? 'all' : queue.repeat === 'all' ? 'one' : 'off',
          }),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` changes with the locale, which is in the deps
    [playing, queue?.shuffle, queue?.repeat, locale],
  );
  // Pages and panels first (in the order features were registered), then playback controls.
  const commands = useMemo<Command[]>(() => [...contributed, ...playback], [contributed, playback]);

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
      if (route) navigateTo(route);
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
          aria-label={t('palette.title')}
          className="fixed top-[12vh] left-1/2 z-50 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl focus:outline-none"
        >
          <Dialog.Title className="sr-only">{t('palette.title')}</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-fg-subtle" />
            <input
              ref={input}
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-autocomplete="list"
              aria-activedescendant={total > 0 ? `palette-option-${String(active)}` : undefined}
              aria-label={t('palette.placeholder')}
              value={query}
              placeholder={t('palette.placeholder')}
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
              {t('palette.esc')}
            </kbd>
          </div>
          <ul
            id="palette-list"
            role="listbox"
            aria-label={t('palette.title')}
            className="max-h-[50vh] overflow-y-auto p-1"
          >
            {matches.map((c, i) => (
              <Row
                key={c.id}
                id={`palette-option-${String(i)}`}
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
                id={`palette-option-${String(matches.length + i)}`}
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
                <span className="text-xs text-fg-subtle">
                  {e.item ? t(KIND_KEY[e.item.kind]) : ''}
                </span>
              </Row>
            ))}
            {q && (
              <Row
                id={`palette-option-${String(total - 1)}`}
                active={total - 1 === active}
                onClick={() => choose(total - 1)}
                onHover={() => setActive(total - 1)}
              >
                <Search className="size-4 text-fg-muted" />
                <span className="flex-1 truncate">{t('palette.searchFor', { query: q })}</span>
              </Row>
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** One option of the palette's list. The input drives the keyboard; the mouse clicks the row itself. */
function Row({
  id,
  active,
  onClick,
  onHover,
  children,
}: {
  id: string;
  active: boolean;
  onClick: () => void;
  onHover: () => void;
  children: ReactNode;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-start text-sm',
        active && 'bg-bg-overlay',
      )}
    >
      {children}
    </li>
  );
}
