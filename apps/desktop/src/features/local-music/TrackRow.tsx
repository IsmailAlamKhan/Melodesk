import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@melodesk/ui';
import { ListEnd, ListStart, MoreHorizontal, Pencil, Play } from 'lucide-react';
import { useMemo } from 'react';
import { LiveBars } from '../../app/components/LiveBars';
import {
  ContextEntries,
  DropdownEntries,
  menuContent,
  type MenuEntry,
} from '../../app/components/menu';
import { useT } from '../../i18n/index';
import { usePlayerStore } from '../../player/store';
import { LOCAL_ID_PREFIX } from '../../player/sourceIds';
import { localPlayer } from './engine';
import type { LocalTrack } from './library';
import { editTags } from './TagEditor';

export const clock = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
};

/** Play `tracks` from `index` (or just the one), as a new queue. */
export function playList(tracks: readonly LocalTrack[], index: number, shuffle = false): void {
  localPlayer()?.play(tracks, index, { shuffle });
}

/** Whether this song is the one playing, and whether it is making sound. */
export function useIsCurrent(track: LocalTrack): { current: boolean; playing: boolean } {
  const id = usePlayerStore((s) => s.track?.videoId ?? null);
  const playing = usePlayerStore((s) => s.state?.playing ?? false);
  const current = id === `${LOCAL_ID_PREFIX}${String(track.id)}`;
  return { current, playing: current && playing };
}

export function useTrackEntries(track: LocalTrack, onPlay: () => void): MenuEntry[] {
  const t = useT();
  return useMemo<MenuEntry[]>(
    () => [
      { key: 'play', label: t('local.menu.play'), icon: <Play />, run: onPlay },
      {
        key: 'next',
        label: t('menu.playNext'),
        icon: <ListStart />,
        run: () => localPlayer()?.enqueue([track], 'next'),
      },
      {
        key: 'end',
        label: t('menu.addToQueue'),
        icon: <ListEnd />,
        run: () => localPlayer()?.enqueue([track], 'end'),
      },
      // Tags live in files; a song from a server has none to edit here.
      ...(track.remote
        ? []
        : [
            {
              key: 'edit',
              label: t('local.edit.menu'),
              icon: <Pencil />,
              run: () => editTags(track),
            },
          ]),
    ],
    [track, onPlay, t],
  );
}

/** One song in a list: number or equaliser, title and artist, album, length. */
export function TrackRow({
  track,
  index,
  onPlay,
  showAlbum = true,
  showArtist = true,
  style,
}: {
  track: LocalTrack;
  index: number;
  onPlay: () => void;
  showAlbum?: boolean;
  showArtist?: boolean;
  style?: React.CSSProperties;
}) {
  const t = useT();
  const { current, playing } = useIsCurrent(track);
  const entries = useTrackEntries(track, onPlay);
  const number = track.trackNo ?? index + 1;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          role="row"
          tabIndex={0}
          style={style}
          onClick={(e) => {
            if (!(e.target instanceof Element && e.target.closest('button'))) onPlay();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onPlay();
          }}
          className={cn(
            'group grid h-14 cursor-pointer items-center gap-3 rounded-lg px-2 outline-none hover:bg-bg-overlay focus-visible:ring-2 focus-visible:ring-accent',
            showAlbum
              ? 'grid-cols-[minmax(0,1fr)_auto_2.5rem] rail:grid-cols-[2rem_minmax(0,3fr)_minmax(0,2fr)_auto_2.5rem]'
              : 'grid-cols-[minmax(0,1fr)_auto_2.5rem] rail:grid-cols-[2rem_minmax(0,1fr)_auto_2.5rem]',
            current && 'bg-accent-soft text-accent',
          )}
        >
          <div
            role="cell"
            className="flex w-8 items-center justify-center text-xs tabular-nums text-fg-subtle max-rail:hidden"
          >
            {playing ? (
              <LiveBars bars={3} className="text-accent" />
            ) : (
              <>
                <span className="group-hover:hidden">{number}</span>
                <Play className="hidden size-4 translate-x-px text-fg group-hover:block" />
              </>
            )}
          </div>
          <div role="cell" className="min-w-0">
            <div className={cn('truncate text-sm font-medium', !current && 'text-fg')}>
              {track.title}
            </div>
            {showArtist && <div className="truncate text-xs text-fg-muted">{track.artist}</div>}
          </div>
          {showAlbum && (
            <div role="cell" className="truncate text-xs text-fg-muted max-rail:hidden">
              {track.album ?? ''}
            </div>
          )}
          <div role="cell" className="text-xs tabular-nums text-fg-subtle">
            {clock(track.durationMs)}
          </div>
          <div role="cell">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label={t('common.more')}
                  className="grid size-8 place-items-center rounded-full text-fg-muted opacity-0 hover:text-fg focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 max-rail:opacity-100"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  className={menuContent}
                  // Drawn elsewhere, but for React inside the row: it must not also play the song.
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <DropdownEntries entries={entries} />
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
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
