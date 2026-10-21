import { BROWSE_IDS } from '@melodesk/adapter';
import { cn } from '@melodesk/ui';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useEffect, useRef } from 'react';
import { useInfiniteBrowse } from '../../data/hooks';
import { ErrorState } from '../../app/components/ErrorState';
import { ChipBar } from '../../app/components/ChipBar';
import { ListSkeleton } from '../../app/components/PageSkeleton';
import { ShelfView } from '../../app/components/ShelfView';
import { useSearchParams } from 'react-router';
import { useT, type MessageKey } from '../../i18n/index';
import { routeForEndpoint } from '../../player/actions';
import { useNavigate } from 'react-router';

const TABS: { to: string; labelKey: MessageKey; end?: boolean }[] = [
  { to: '/library', labelKey: 'library.tab.recent', end: true },
  { to: '/library/playlists', labelKey: 'library.tab.playlists' },
  { to: '/library/songs', labelKey: 'library.tab.songs' },
  { to: '/library/albums', labelKey: 'library.tab.albums' },
  { to: '/library/artists', labelKey: 'library.tab.artists' },
  { to: '/library/subscriptions', labelKey: 'library.tab.subscriptions' },
  { to: '/library/podcasts', labelKey: 'library.tab.podcasts' },
  { to: '/library/uploads', labelKey: 'library.tab.uploads' },
  { to: '/library/history', labelKey: 'library.tab.history' },
];

/** Known sort params (from the web client) for library lists. */
export const LIBRARY_SORT = {
  recent: undefined,
  recentlyAdded: 'ggMGKgQIABAB',
  aToZ: 'ggMGKgQIARAA',
  zToA: 'ggMGKgQIARAB',
} as const;

export function LibraryLayout() {
  const t = useT();
  return (
    <div className="flex flex-col gap-4 pb-8">
      <h1 className="px-4 pt-6 font-display text-3xl font-bold tracking-tight">
        {t('nav.library')}
      </h1>
      <nav
        aria-label={t('library.sections')}
        className="flex gap-1 overflow-x-auto border-b border-border px-4 [scrollbar-width:none]"
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end ?? false}
            className={({ isActive }) =>
              cn(
                '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm',
                isActive ? 'border-fg text-fg' : 'border-transparent text-fg-muted hover:text-fg',
              )
            }
          >
            {t(tab.labelKey)}
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
  const t = useT();
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
            {t('library.sort')}
            <select
              value={sort}
              onChange={(e) => {
                const next = new URLSearchParams(sp);
                next.set('sort', e.target.value);
                setSp(next);
              }}
              className="rounded-md border border-border bg-bg-elevated px-2 py-1 text-sm text-fg"
            >
              <option value="recent">{t('library.sort.recent')}</option>
              <option value="recentlyAdded">{t('library.sort.recentlyAdded')}</option>
              <option value="aToZ">{t('library.sort.aToZ')}</option>
              <option value="zToA">{t('library.sort.zToA')}</option>
            </select>
          </label>
        )}
      </div>
      {merged.map((s) => (
        <ShelfView key={s.id} shelf={s} />
      ))}
      {!merged.length && <div className="p-8 text-fg-muted">{t('library.empty')}</div>}
      <div ref={sentinel} className="h-px" />
    </div>
  );
}
