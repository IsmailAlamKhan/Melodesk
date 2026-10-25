import { Button, cn } from '@melodesk/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FolderPlus, Loader2, Music2, Play, RefreshCw, Search, Shuffle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useT } from '../../i18n/index';
import { useLocalCover } from './covers';
import { useAlbums, useArtists, useFolders, useSongs, useTrackCount } from './hooks';
import { albumTracks, type AlbumSummary, type ArtistSummary } from './library';
import { addFolder, rescan, useScanStatus } from './scan';
import { playList, TrackRow } from './TrackRow';

type Tab = 'songs' | 'albums' | 'artists';
const TABS: Tab[] = ['songs', 'albums', 'artists'];

/** The scrolling page the app lays its routes into (long lists are windowed against it). */
const scroller = (): HTMLElement | null => document.querySelector('main');

export const albumLink = (a: { album: string; artist: string }): string =>
  `/local/album?album=${encodeURIComponent(a.album)}&artist=${encodeURIComponent(a.artist)}`;
export const artistLink = (artist: string): string =>
  `/local/artist?artist=${encodeURIComponent(artist)}`;

/** The user's own music: songs, albums and artists from the folders they added. */
export function LocalPage() {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const tab = TABS.find((x) => x === sp.get('tab')) ?? 'songs';
  const urlQuery = sp.get('q') ?? '';
  const [typed, setTyped] = useState(urlQuery);
  const folders = useFolders();
  const count = useTrackCount();
  const scan = useScanStatus();
  const songs = useSongs(urlQuery);

  // The box answers as you type, but the address (and the queries) follow after a short pause.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (typed !== urlQuery)
        setSp(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (typed) next.set('q', typed);
            else next.delete('q');
            return next;
          },
          { replace: true },
        );
    }, 200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [typed, urlQuery, setSp]);

  const noFolders = folders.data?.length === 0;
  const list = songs.data ?? [];
  return (
    <div className="flex flex-col gap-4 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3 px-4 pt-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{t('local.title')}</h1>
          <p className="mt-1 text-sm text-fg-muted" role="status">
            {scan.running
              ? t('local.scanning', { found: scan.found })
              : t('local.count', { count: count.data ?? 0 })}
          </p>
        </div>
        {!noFolders && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={list.length === 0}
              onClick={() => {
                playList(list, 0);
              }}
            >
              <Play className="size-4" />
              {t('local.playAll')}
            </Button>
            <Button
              variant="ghost"
              disabled={list.length === 0}
              onClick={() => {
                playList(list, 0, true);
              }}
            >
              <Shuffle className="size-4" />
              {t('local.shuffle')}
            </Button>
            <Button
              variant="ghost"
              disabled={scan.running}
              onClick={() => void rescan()}
              aria-label={t('local.rescan')}
            >
              {scan.running ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {t('local.rescan')}
            </Button>
          </div>
        )}
      </header>

      {noFolders ? (
        <Empty
          title={t('local.empty.title')}
          body={t('local.empty.body')}
          action={
            <Button variant="primary" onClick={() => void addFolder()}>
              <FolderPlus className="size-4" />
              {t('local.addFolder')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 px-4">
            <div role="tablist" className="flex gap-2">
              {TABS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => {
                    setSp(
                      (prev) => {
                        const next = new URLSearchParams(prev);
                        next.set('tab', id);
                        return next;
                      },
                      { replace: true },
                    );
                  }}
                  className={cn(
                    'h-9 rounded-full px-4 text-sm font-medium transition-colors duration-(--duration-fast)',
                    tab === id
                      ? 'bg-accent text-accent-fg'
                      : 'bg-bg-overlay text-fg hover:bg-accent-soft',
                  )}
                >
                  {t(`local.tab.${id}`)}
                </button>
              ))}
            </div>
            <label className="relative min-w-48 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
              <input
                type="search"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                }}
                aria-label={t('local.search')}
                placeholder={t('local.search')}
                className="h-9 w-full rounded-full bg-bg-overlay ps-9 pe-3 text-sm outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-accent"
              />
            </label>
          </div>
          {tab === 'songs' && <SongList query={urlQuery} />}
          {tab === 'albums' && <AlbumGrid query={urlQuery} />}
          {tab === 'artists' && <ArtistList query={urlQuery} />}
        </>
      )}
    </div>
  );
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-4 flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-bg-elevated p-10 text-center">
      <Music2 className="size-10 text-fg-subtle" />
      <h2 className="font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-fg-muted">{body}</p>
      {action}
    </div>
  );
}

function NothingFound({ query }: { query: string }) {
  const t = useT();
  return (
    <p className="px-6 py-8 text-sm text-fg-muted">
      {query ? t('local.noResults', { query }) : t('local.noneYet')}
    </p>
  );
}

/** Every song, windowed: a library of tens of thousands only draws what is on screen. */
function SongList({ query }: { query: string }) {
  const songs = useSongs(query);
  const list = songs.data ?? [];
  const box = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0);
  useEffect(() => {
    const main = scroller();
    if (!box.current || !main) return;
    setMargin(
      box.current.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop,
    );
  }, [list.length]);
  // eslint-disable-next-line react-hooks/incompatible-library -- the list is windowed by hand-fed row styles, nothing here is memoised
  const virtual = useVirtualizer({
    count: list.length,
    getScrollElement: scroller,
    estimateSize: () => 56,
    overscan: 8,
    scrollMargin: margin,
  });
  if (songs.data && list.length === 0) return <NothingFound query={query} />;
  return (
    <div
      ref={box}
      role="table"
      className="relative px-2"
      style={{ height: virtual.getTotalSize() }}
    >
      {virtual.getVirtualItems().map((row) => {
        const track = list[row.index];
        return track ? (
          <TrackRow
            key={track.id}
            track={track}
            index={row.index}
            style={{
              position: 'absolute',
              insetInline: '0.5rem',
              top: 0,
              height: row.size,
              transform: `translateY(${String(row.start - virtual.options.scrollMargin)}px)`,
            }}
            onPlay={() => {
              playList(list, row.index);
            }}
          />
        ) : null;
      })}
    </div>
  );
}

/** Loads the cover only once the tile is near the screen. */
export function LazyCover({
  path,
  className,
  round,
}: {
  path: string;
  className?: string;
  round?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
    };
  }, [near]);
  const cover = useLocalCover(near ? path : null);
  return (
    <div
      ref={ref}
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden bg-bg-overlay text-fg-subtle',
        round ? 'rounded-full' : 'rounded-xl',
        className,
      )}
    >
      {cover ? (
        <img src={cover} alt="" draggable={false} className="size-full object-cover" />
      ) : (
        <Music2 className="size-1/3" />
      )}
    </div>
  );
}

const PAGE = 60;

/** Show more of a long list as the end comes into view. */
function useGrowing(total: number): {
  shown: number;
  sentinel: React.RefObject<HTMLDivElement>;
} {
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || shown >= total) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShown((n) => n + PAGE);
      },
      { rootMargin: '600px' },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
    };
  }, [shown, total]);
  return { shown, sentinel };
}

function AlbumGrid({ query }: { query: string }) {
  const t = useT();
  const albums = useAlbums(query);
  const list = albums.data ?? [];
  const { shown, sentinel } = useGrowing(list.length);
  if (albums.data && list.length === 0) return <NothingFound query={query} />;
  return (
    <div className="px-4">
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
        {list.slice(0, shown).map((a) => (
          <li key={`${a.artist}\u0001${a.album}`}>
            <AlbumTile album={a} />
          </li>
        ))}
      </ul>
      <div ref={sentinel} aria-hidden className="h-px" />
      <span className="sr-only">{t('local.tab.albums')}</span>
    </div>
  );
}

function AlbumTile({ album }: { album: AlbumSummary }) {
  const t = useT();
  return (
    <div className="group relative">
      <Link
        to={albumLink(album)}
        className="flex flex-col gap-2 rounded-xl p-2 outline-none hover:bg-bg-overlay focus-visible:ring-2 focus-visible:ring-accent"
      >
        <LazyCover path={album.coverPath} className="aspect-square w-full" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{album.album}</div>
          <div className="truncate text-xs text-fg-muted">
            {album.artist}
            {album.year ? ` · ${String(album.year)}` : ''}
          </div>
        </div>
      </Link>
      <button
        type="button"
        aria-label={t('local.playAlbum', { title: album.album })}
        onClick={() => {
          void albumTracks(album.album, album.artist).then((tracks) => {
            playList(tracks, 0);
          });
        }}
        className="absolute end-4 top-[calc(100%-5.5rem)] hidden size-10 items-center justify-center rounded-full bg-accent text-accent-fg shadow-xl hover:scale-105 focus-visible:flex group-hover:flex"
      >
        <Play className="size-5 translate-x-px" />
      </button>
    </div>
  );
}

function ArtistList({ query }: { query: string }) {
  const t = useT();
  const artists = useArtists(query);
  const list = artists.data ?? [];
  const { shown, sentinel } = useGrowing(list.length);
  if (artists.data && list.length === 0) return <NothingFound query={query} />;
  return (
    <div className="px-2">
      <ul>
        {list.slice(0, shown).map((a) => (
          <li key={a.artist}>
            <ArtistRow artist={a} />
          </li>
        ))}
      </ul>
      <div ref={sentinel} aria-hidden className="h-px" />
      <span className="sr-only">{t('local.tab.artists')}</span>
    </div>
  );
}

function ArtistRow({ artist }: { artist: ArtistSummary }) {
  const t = useT();
  return (
    <Link
      to={artistLink(artist.artist)}
      className="flex h-16 items-center gap-3 rounded-lg px-2 outline-none hover:bg-bg-overlay focus-visible:ring-2 focus-visible:ring-accent"
    >
      <LazyCover path={artist.coverPath} round className="size-12" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{artist.artist}</div>
        <div className="truncate text-xs text-fg-muted">
          {t('local.artistCounts', { songs: artist.tracks, albums: artist.albums })}
        </div>
      </div>
    </Link>
  );
}
