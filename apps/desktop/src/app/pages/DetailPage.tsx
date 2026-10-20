import { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useInfiniteBrowse } from '../../data/hooks';
import { playEndpoint } from '../../player/actions';
import { ErrorState } from '../components/ErrorState';
import { ItemRow } from '../components/ItemRow';
import { ListSkeleton, PageSkeleton } from '../components/PageSkeleton';
import { PageHeaderView } from '../components/PageHeaderView';
import { ShelfView } from '../components/ShelfView';

/** Artist, album and playlist pages: hero header + shelves; long track lists continue on scroll. */
export function DetailPage({ kind }: { kind: 'artist' | 'album' | 'playlist' }) {
  const params = useParams();
  const [search] = useSearchParams();
  const id = params['id'] ?? '';
  const browseId = kind === 'playlist' ? `VL${id}` : id;
  const q = useInfiniteBrowse(browseId, search.get('params') ?? undefined);
  const sentinel = useRef<HTMLDivElement>(null);

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
  }, [q]);

  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const page = q.data.pages[0]?.page;
  const shelves = q.data.pages.flatMap((p) => p.shelves);
  // Track lists: the first untitled list shelf plus continuation chunks.
  const trackShelf =
    kind !== 'artist' ? shelves.find((s) => s.layout === 'list' && !s.title) : undefined;
  const tracks = trackShelf
    ? shelves.filter((s) => s.layout === 'list' && !s.title).flatMap((s) => s.items)
    : [];
  const others = shelves.filter(
    (s) => s !== trackShelf && !(trackShelf && s.layout === 'list' && !s.title),
  );
  const playlistId = page?.header?.playlistId ?? (kind === 'playlist' ? id : null);
  return (
    <div className="flex flex-col gap-6 pb-8">
      {page?.header && <PageHeaderView header={page.header} round={kind === 'artist'} />}
      {tracks.length > 0 && (
        <div role="table" className="flex flex-col px-4">
          {tracks.map((t, i) => (
            <ItemRow
              key={t.key}
              item={t}
              index={i}
              showIndex
              showAlbum={kind === 'playlist'}
              onPlay={
                playlistId && (t.kind === 'song' || t.kind === 'video')
                  ? () =>
                      void playEndpoint({
                        type: 'watch',
                        videoId: t.videoId,
                        playlistId,
                        index: i,
                        ...(t.setVideoId ? { playlistSetVideoId: t.setVideoId } : {}),
                      })
                  : undefined
              }
            />
          ))}
          {q.isFetchingNextPage && <ListSkeleton rows={4} />}
          <div ref={sentinel} className="h-px" />
        </div>
      )}
      <div className="flex flex-col gap-8 px-2">
        {others.map((s) => (
          <ShelfView key={s.id} shelf={s} />
        ))}
      </div>
    </div>
  );
}
