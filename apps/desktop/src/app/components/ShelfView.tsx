import type { Shelf } from '@melodesk/adapter';
import { IconButton } from '@melodesk/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef } from 'react';
import { Link } from 'react-router';
import { routeForEndpoint } from '../../player/actions';
import { ItemCard } from './ItemCard';
import { ItemRow } from './ItemRow';

/** Renders one YouTube shelf in its own layout (carousel / list / grid). */
export function ShelfView({ shelf }: { shelf: Shelf }) {
  const more = routeForEndpoint(shelf.moreEndpoint);
  const scroller = useRef<HTMLDivElement>(null);
  if (!shelf.items.length) return null;
  const scrollBy = (dir: 1 | -1): void => {
    scroller.current?.scrollBy({
      left: dir * (scroller.current.clientWidth - 160),
      behavior: 'smooth',
    });
  };
  return (
    <section aria-label={shelf.title || undefined} className="flex flex-col gap-2">
      {(shelf.title || more) && (
        <header className="flex items-end justify-between px-2">
          <div className="min-w-0">
            {shelf.subtitle && (
              <div className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
                {shelf.subtitle}
              </div>
            )}
            <h2 className="truncate font-display text-xl font-semibold tracking-tight">
              {more ? (
                <Link to={more} className="hover:underline">
                  {shelf.title}
                </Link>
              ) : (
                shelf.title
              )}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {more && (
              <Link
                to={more}
                className="mr-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-fg-muted hover:bg-bg-overlay hover:text-fg"
              >
                More
              </Link>
            )}
            {shelf.layout === 'carousel' && (
              <>
                <IconButton label="Scroll left" size="sm" onClick={() => scrollBy(-1)}>
                  <ChevronLeft />
                </IconButton>
                <IconButton label="Scroll right" size="sm" onClick={() => scrollBy(1)}>
                  <ChevronRight />
                </IconButton>
              </>
            )}
          </div>
        </header>
      )}
      {shelf.layout === 'carousel' && (
        <div
          ref={scroller}
          className="flex gap-1 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:none]"
        >
          {shelf.items.map((item) => (
            <ItemCard key={item.key} item={item} />
          ))}
        </div>
      )}
      {shelf.layout === 'grid' && (
        <div className="flex flex-wrap gap-1 px-1">
          {shelf.items.map((item) => (
            <ItemCard key={item.key} item={item} />
          ))}
        </div>
      )}
      {(shelf.layout === 'list' || shelf.layout === 'ranked') && (
        <div role="table" className="flex flex-col">
          {shelf.items.map((item, i) => (
            <ItemRow
              key={item.key}
              item={item}
              index={i}
              showIndex={shelf.layout === 'ranked'}
              showAlbum={shelf.items.length > 8}
            />
          ))}
        </div>
      )}
    </section>
  );
}
