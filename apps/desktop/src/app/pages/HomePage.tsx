import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { BROWSE_IDS } from '@melodesk/adapter';
import { useInfiniteBrowse } from '../../data/hooks';
import { useAccount } from '../../data/hooks';
import { ChipBar } from '../components/ChipBar';
import { ErrorState } from '../components/ErrorState';
import { PageSkeleton, ShelfSkeleton } from '../components/PageSkeleton';
import { ShelfView } from '../components/ShelfView';
import { usePlayerStore } from '../../player/store';
import { Welcome } from '../Welcome';

/** The signed-in user's own home feed, in YouTube's order, with infinite continuation. */
export function HomePage() {
  const [chipParams, setChipParams] = useState<string | undefined>(undefined);
  const [chip, setChip] = useState<string | null>(null);
  const q = useInfiniteBrowse(BROWSE_IDS.home, chipParams);
  const sentinel = useRef<HTMLDivElement>(null);
  const account = useAccount();
  const loggedIn = usePlayerStore((s) => s.loggedIn);
  const ready = usePlayerStore((s) => s.ready);
  useNavigate();

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

  if (!ready || (!loggedIn && !account.data?.signedIn)) return <Welcome />;
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const first = q.data.pages[0]?.page;
  const shelves = q.data.pages.flatMap((p) => p.shelves);
  return (
    <div className="flex flex-col gap-8 pb-8">
      <div className="sticky top-0 z-10 px-2 pt-4 pb-2 backdrop-blur-xl">
        <ChipBar
          chips={first?.chips ?? []}
          selected={chip}
          onSelect={(c) => {
            setChip(c?.text ?? null);
            setChipParams(c?.endpoint?.type === 'browse' ? c.endpoint.params : undefined);
          }}
        />
      </div>
      <div className="flex flex-col gap-8 px-2">
        {shelves.map((s) => (
          <ShelfView key={s.id} shelf={s} />
        ))}
        {q.isFetchingNextPage && <ShelfSkeleton />}
        <div ref={sentinel} className="h-px" />
      </div>
    </div>
  );
}
