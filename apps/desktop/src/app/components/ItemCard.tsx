import type { Item } from '@melodesk/adapter';
import { Tooltip, cn } from '@melodesk/ui';
import { Play } from 'lucide-react';
import { useNavigate } from 'react-router';
import { playItem, routeForEndpoint } from '../../player/actions';
import { useAppearance } from '../../appearance/store';
import { useT } from '../../i18n';
import { Artwork } from './Artwork';
import { ItemContextMenu, ItemMenuButton } from './ItemMenu';

/** Square/round tile for carousels and grids. */
const TILE_PX = { compact: 144, comfortable: 168, spacious: 192 } as const;

export function ItemCard({ item, width }: { item: Item; width?: number }) {
  const t = useT();
  const density = useAppearance((s) => s.density);
  const tile = width ?? TILE_PX[density];
  const navigate = useNavigate();
  const route = routeForEndpoint(item.endpoint);
  const playable =
    !!item.playEndpoint ||
    item.endpoint?.type === 'watch' ||
    item.endpoint?.type === 'watchPlaylist';
  const isVideo = item.kind === 'video';
  const round = item.kind === 'artist';
  const open = (): void => {
    if (route) void navigate(route);
    else void playItem(item);
  };
  if (item.kind === 'category') return <CategoryTile item={item} />;
  if (item.kind === 'action') return <ActionTile item={item} />;
  return (
    <ItemContextMenu item={item}>
      <div
        role="link"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter') open();
        }}
        className="group box-content flex shrink-0 cursor-pointer flex-col gap-2 rounded-lg p-2 outline-none transition-colors duration-(--duration-fast) hover:bg-bg-overlay focus-visible:ring-2 focus-visible:ring-accent"
        style={{ width: isVideo ? tile * 1.6 : tile }}
      >
        <div className="relative">
          <Artwork
            thumbnails={item.thumbnails}
            size={isVideo ? Math.round(tile * 1.6) : tile}
            round={round}
            fill={isVideo}
            className={cn(isVideo && 'aspect-video w-full')}
          />
          {playable && (
            <Tooltip label={t('media.playItem', { title: item.title })}>
              <button
                type="button"
                aria-label={t('media.playItem', { title: item.title })}
                onClick={(e) => {
                  e.stopPropagation();
                  void playItem(item);
                }}
                className="absolute end-2 bottom-2 flex size-10 items-center justify-center rounded-full bg-bg/90 text-fg opacity-0 shadow-lg transition-all duration-(--duration-fast) group-hover:opacity-100 hover:scale-105 focus-visible:opacity-100"
              >
                <Play className="size-5 translate-x-px" />
              </button>
            </Tooltip>
          )}
          <ItemMenuButton
            item={item}
            className="absolute top-1 end-1 bg-bg/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          />
        </div>
        <div className={cn('min-w-0', round && 'text-center')}>
          <div className="truncate text-sm font-medium" title={item.title}>
            {item.title}
          </div>
          <div className="truncate text-xs text-fg-muted" title={item.subtitle}>
            {item.isExplicit && (
              <span
                title={t('common.explicit')}
                className="me-1 rounded-sm border border-fg-subtle px-1 text-[10px]"
              >
                {t('common.explicitBadge')}
              </span>
            )}
            {subtitleOf(item)}
          </div>
        </div>
      </div>
    </ItemContextMenu>
  );
}

export function subtitleOf(item: Item): string {
  switch (item.kind) {
    case 'song':
    case 'video':
      return item.subtitle || item.artists.map((a) => a.name).join(', ');
    case 'album':
      return (
        [item.albumType, item.artists.map((a) => a.name).join(', '), item.year]
          .filter(Boolean)
          .join(' • ') || item.subtitle
      );
    case 'playlist':
      return item.subtitle || [item.author?.name, item.description].filter(Boolean).join(' • ');
    case 'artist':
      return item.description ?? item.subtitle;
    default:
      return item.subtitle;
  }
}

function CategoryTile({ item }: { item: Extract<Item, { kind: 'category' }> }) {
  const navigate = useNavigate();
  const route = routeForEndpoint(item.endpoint);
  return (
    <button
      type="button"
      onClick={() => {
        if (route) void navigate(route);
      }}
      className="flex h-12 w-44 shrink-0 items-center gap-3 overflow-hidden rounded-md bg-bg-overlay text-start text-sm font-medium transition-colors hover:bg-border focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span
        className="h-full w-1.5 shrink-0"
        style={{ background: item.color ?? 'var(--color-accent)' }}
      />
      <span className="truncate pe-3">{item.title}</span>
    </button>
  );
}

function ActionTile({ item }: { item: Extract<Item, { kind: 'action' }> }) {
  return (
    <button
      type="button"
      onClick={() => void playItem(item)}
      className="flex h-12 shrink-0 items-center gap-2 rounded-md border border-dashed border-border px-4 text-sm text-fg-muted hover:bg-bg-overlay"
    >
      {item.title}
    </button>
  );
}
