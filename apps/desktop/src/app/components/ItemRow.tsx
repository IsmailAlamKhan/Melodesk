import type { Item } from '@melodesk/adapter';
import { Tooltip, cn } from '@melodesk/ui';
import { Play } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { useT } from '../../i18n';
import { playItem, routeForEndpoint } from '../../player/actions';
import { usePlayerStore } from '../../player/store';
import { Artwork } from './Artwork';
import { ItemContextMenu, ItemMenuButton } from './ItemMenu';
import { subtitleOf } from './ItemCard';

function fmt(seconds: number | null): string {
  if (seconds === null) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m)}:${String(s).padStart(2, '0')}`;
}

export interface ItemRowProps {
  item: Item;
  index?: number | undefined;
  showIndex?: boolean | undefined;
  showAlbum?: boolean | undefined;
  /** Override play (e.g. play within a playlist context at this index). */
  onPlay?: (() => void) | undefined;
  dense?: boolean | undefined;
}

/** List row for tracks, library entries, search results. */
export function ItemRow({ item, index, showIndex, showAlbum = true, onPlay, dense }: ItemRowProps) {
  const t = useT();
  const navigate = useNavigate();
  const currentId = usePlayerStore((s) => s.track?.videoId ?? null);
  const playing = usePlayerStore((s) => s.state?.playing ?? false);
  const videoId =
    item.kind === 'song' || item.kind === 'video' || item.kind === 'episode' ? item.videoId : null;
  const isCurrent = videoId !== null && videoId === currentId;
  const route = routeForEndpoint(item.endpoint);
  const playable =
    !!item.playEndpoint ||
    item.endpoint?.type === 'watch' ||
    item.endpoint?.type === 'watchPlaylist';
  const activate = (): void => {
    if (onPlay) onPlay();
    else if (playable) void playItem(item);
    else if (route) void navigate(route);
  };
  if (item.kind === 'action') {
    return (
      <button
        type="button"
        onClick={() => void playItem(item)}
        className="flex h-12 items-center gap-3 rounded-md px-3 text-sm text-fg-muted hover:bg-bg-overlay"
      >
        {item.title}
      </button>
    );
  }
  const duration =
    item.kind === 'song' || item.kind === 'video' || item.kind === 'episode'
      ? item.durationSeconds
      : null;
  const artists = item.kind === 'song' || item.kind === 'video' ? item.artists : [];
  const album = item.kind === 'song' || item.kind === 'video' ? item.album : null;
  return (
    <ItemContextMenu item={item}>
      <div
        role="row"
        tabIndex={0}
        onDoubleClick={activate}
        onKeyDown={(e) => {
          if (e.key === 'Enter') activate();
        }}
        className={cn(
          'group grid cursor-default items-center gap-3 rounded-md px-2 outline-none hover:bg-bg-overlay focus-visible:ring-2 focus-visible:ring-accent',
          dense ? 'h-[calc(var(--row-h)-0.5rem)]' : 'h-(--row-h)',
          showAlbum
            ? 'grid-cols-[2rem_auto_minmax(0,3fr)_minmax(0,2fr)_auto_2.5rem]'
            : 'grid-cols-[2rem_auto_minmax(0,1fr)_auto_2.5rem]',
          isCurrent && 'text-accent',
        )}
      >
        <div className="flex w-8 items-center justify-center text-xs tabular-nums text-fg-subtle">
          {playable ? (
            <>
              <span className={cn('group-hover:hidden', isCurrent && playing && 'hidden')}>
                {showIndex && index !== undefined ? index + 1 : ''}
              </span>
              <Tooltip label={t('media.playItem', { title: item.title })}>
                <button
                  type="button"
                  aria-label={t('media.playItem', { title: item.title })}
                  onClick={activate}
                  className={cn(
                    'hidden size-8 items-center justify-center rounded-full text-fg group-hover:flex',
                    isCurrent && playing && 'flex',
                  )}
                >
                  {isCurrent && playing ? <EqBars /> : <Play className="size-4 translate-x-px" />}
                </button>
              </Tooltip>
            </>
          ) : (
            <span>{showIndex && index !== undefined ? index + 1 : ''}</span>
          )}
        </div>
        <Artwork
          thumbnails={item.thumbnails}
          size={dense ? 36 : 40}
          round={item.kind === 'artist'}
        />
        <div className="min-w-0">
          <div className={cn('truncate text-sm font-medium', !isCurrent && 'text-fg')}>
            {route ? (
              <Link to={route} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                {item.title}
              </Link>
            ) : (
              item.title
            )}
          </div>
          <div className="truncate text-xs text-fg-muted">
            {item.isExplicit && (
              <span
                title={t('common.explicit')}
                className="me-1 rounded-sm border border-fg-subtle px-1 text-[10px]"
              >
                {t('common.explicitBadge')}
              </span>
            )}
            {artists.length
              ? artists.map((a, i) => (
                  <LinkRun
                    key={`${a.name}-${String(i)}`}
                    name={a.name}
                    route={routeForEndpoint(a.endpoint)}
                    last={i === artists.length - 1}
                  />
                ))
              : subtitleOf(item)}
          </div>
        </div>
        {showAlbum && (
          <div className="truncate text-xs text-fg-muted">
            {album ? (
              <LinkRun name={album.name} route={routeForEndpoint(album.endpoint)} last />
            ) : item.kind === 'song' || item.kind === 'video' ? (
              (item.stat ?? '')
            ) : (
              ''
            )}
          </div>
        )}
        <div className="text-xs tabular-nums text-fg-subtle">{fmt(duration)}</div>
        <ItemMenuButton
          item={item}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        />
      </div>
    </ItemContextMenu>
  );
}

function LinkRun({ name, route, last }: { name: string; route: string | null; last: boolean }) {
  return (
    <>
      {route ? (
        <Link to={route} className="hover:underline" onClick={(e) => e.stopPropagation()}>
          {name}
        </Link>
      ) : (
        name
      )}
      {!last && ', '}
    </>
  );
}

function EqBars() {
  return (
    <span aria-hidden className="flex h-3 items-end gap-px">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-0.5 animate-pulse bg-accent"
          style={{ height: `${String(40 + i * 25)}%`, animationDelay: `${String(i * 120)}ms` }}
        />
      ))}
    </span>
  );
}
