import { BROWSE_IDS } from '@melodesk/adapter';
import { cn } from '@melodesk/ui';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useEffect, useRef } from 'react';
import { useInfiniteBrowse } from '../../data/hooks';
import { ErrorState } from '../components/ErrorState';
import { ChipBar } from '../components/ChipBar';
import { ListSkeleton } from '../components/PageSkeleton';
import { ShelfView } from '../components/ShelfView';
import { useSearchParams } from 'react-router';
import { routeForEndpoint } from '../../player/actions';
import { useNavigate } from 'react-router';

const TABS = [
  { to: '/library', label: 'Recent', end: true },
  { to: '/library/playlists', label: 'Playlists' },
  { to: '/library/songs', label: 'Songs' },
  { to: '/library/albums', label: 'Albums' },
  { to: '/library/artists', label: 'Artists' },
  { to: '/library/subscriptions', label: 'Subscriptions' },
  { to: '/library/podcasts', label: 'Podcasts' },
  { to: '/library/uploads', label: 'Uploads' },
  { to: '/library/history', label: 'History' },
];

/** Known sort params (from the web client) for library lists. */
export const LIBRARY_SORT = {
  recent: undefined,
  recentlyAdded: 'ggMGKgQIABAB',
  aToZ: 'ggMGKgQIARAA',
  zToA: 'ggMGKgQIARAB',
} as const;

export function LibraryLayout() {
  return (
    <div className="flex flex-col gap-4 pb-8">
      <h1 className="px-4 pt-6 font-display text-3xl font-bold tracking-tight">Library</h1>
      <nav
        aria-label="Library sections"
        className="flex gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none]"
      >
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end ?? false}
            className={({ isActive }) =>
              cn(
                '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm',
                isActive ? 'border-fg text-fg' : 'border-transparent text-fg-muted hover:text-fg',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

const SORTABLE = new Set<string>([
  BROWSE_IDS.libraryPlaylists,
  BROWSE_IDS.librarySongs,
  BROWSE_IDS.libraryAlbums,
  BROWSE_IDS.libraryArtists,
  BROWSE_IDS.librarySubscriptions,
]);

/** One library list (playlists, songs…): a grid/list that continues on scroll, with YouTube's sort options. */
export function LibrarySection({ browseId }: { browseId: string }) {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const sort = (sp.get('sort') ?? 'recent') as keyof typeof LIBRARY_SORT;
  const q = useInfiniteBrowse(
    browseId,
    SORTABLE.has(browseId) ? LIBRARY_SORT[sort] : (sp.get('params') ?? undefined),
  );
  const sentinel = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && q.hasNextPage && !q.isFetchingNextPage)
        void q.fetchNextPage();
    });
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [q, location.pathname]);
  if (q.isPending) return <ListSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const first = q.data.pages[0]?.page;
  const shelves = q.data.pages.flatMap((p) => p.shelves);
  // Continuation chunks of the same list are merged into the first shelf's layout.
  const head = shelves[0];
  const merged =
    head && shelves.length > 1 && shelves.every((s) => !s.title)
      ? [{ ...head, items: shelves.flatMap((s) => s.items) }]
      : shelves;
  return (
    <div className="flex flex-col gap-6 px-2">
      <div className="flex items-center justify-between px-2">
        <ChipBar
          chips={first?.chips ?? []}
          onSelect={(c) => {
            const route = c ? routeForEndpoint(c.endpoint) : null;
            if (route) void navigate(route);
          }}
        />
        {SORTABLE.has(browseId) && (
          <label className="ms-auto flex items-center gap-2 text-xs text-fg-muted">
            Sort
            <select
              value={sort}
              onChange={(e) => {
                const next = new URLSearchParams(sp);
                next.set('sort', e.target.value);
                setSp(next);
              }}
              className="rounded-md border border-border bg-bg-elevated px-2 py-1 text-sm text-fg"
            >
              <option value="recent">Recent activity</option>
              <option value="recentlyAdded">Recently added</option>
              <option value="aToZ">A to Z</option>
              <option value="zToA">Z to A</option>
            </select>
          </label>
        )}
      </div>
      {merged.map((s) => (
        <ShelfView key={s.id} shelf={s} />
      ))}
      {!merged.length && <div className="p-8 text-fg-muted">Nothing here yet.</div>}
      <div ref={sentinel} className="h-px" />
    </div>
  );
}
