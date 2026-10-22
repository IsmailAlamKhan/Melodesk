import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@melodesk/ui';
import { Copy, Image, MoreHorizontal, Sparkles } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import {
  ContextEntries,
  DropdownEntries,
  menuContent,
  type MenuEntry,
} from '../../app/components/menu';
import { toast } from '../../app/toast';
import { useT } from '../../i18n/index';
import { usePlayerStore } from '../../player/store';
import type { Explanation } from './explanations';
import { copyLyricCard } from './lyricCard';

/** What can be done with one line of lyrics: the same entries serve the right-click menu and the "…" button. */
function useLineEntries(line: string, onExplain: () => void): MenuEntry[] {
  const t = useT();
  return useMemo<MenuEntry[]>(
    () => [
      { key: 'explain', label: t('lyrics.line.explain'), icon: <Sparkles />, run: onExplain },
      {
        key: 'copy',
        label: t('lyrics.line.copy'),
        icon: <Copy />,
        run: () => {
          void navigator.clipboard
            .writeText(line)
            .then(() => toast(t('lyrics.line.copied')))
            .catch(() => toast(t('lyrics.line.cardFailed')));
        },
      },
      {
        key: 'card',
        label: t('lyrics.line.card'),
        icon: <Image />,
        run: () => {
          const track = usePlayerStore.getState().track;
          if (!track) return;
          void copyLyricCard({
            line,
            title: track.title,
            artist: track.artist,
            artworkUrl: track.artworkUrl,
          })
            .then(() => toast(t('lyrics.line.cardCopied')))
            .catch(() => toast(t('lyrics.line.cardFailed')));
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` changes with the locale, and `onExplain` is read when chosen
    [line, t],
  );
}

/** Wraps a lyric line with a right-click menu and a "…" button that shows on hover or focus. */
export function LineActions({
  line,
  onExplain,
  children,
}: {
  line: string;
  onExplain: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const entries = useLineEntries(line, onExplain);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="group/line relative">
          {children}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={t('lyrics.line.actions')}
                className={cn(
                  'absolute end-1 top-1 grid size-8 place-items-center rounded-full bg-bg-overlay/80 text-fg-muted opacity-0 backdrop-blur-md transition-opacity',
                  'hover:text-fg focus-visible:opacity-100 group-hover/line:opacity-100 group-focus-within/line:opacity-100 data-[state=open]:opacity-100',
                )}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className={menuContent} align="end" sideOffset={4}>
                <DropdownEntries entries={entries} />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuContent} collisionPadding={8}>
          <ContextEntries entries={entries} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/** The answer under a line while it is being made, once it is there, or when it failed. */
export function ExplanationNote({ value }: { value: Explanation }) {
  const t = useT();
  return (
    <div
      role="note"
      aria-label={t('lyrics.line.explanation')}
      className={cn(
        'relative mx-2 mt-1 mb-2 rounded-lg px-4 py-2 text-sm before:absolute before:inset-y-2 before:start-1.5 before:w-0.5 before:rounded-full',
        value.state === 'error'
          ? 'bg-danger/10 text-danger before:bg-danger'
          : 'bg-bg-overlay/60 text-fg-muted before:bg-accent',
      )}
    >
      {value.state === 'loading' && t('lyrics.line.explaining')}
      {value.state === 'done' && value.text}
      {value.state === 'error' &&
        t(value.reason === 'off' ? 'lyrics.line.explainOff' : 'lyrics.line.explainFailed')}
    </div>
  );
}
