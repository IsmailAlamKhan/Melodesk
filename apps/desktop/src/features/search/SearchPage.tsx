import { useSearchParams } from 'react-router';
import { useSearch } from '../../data/hooks';
import { Button } from '@melodesk/ui';
import { useT } from '../../i18n/index';
import { ChipBar } from '../../app/components/ChipBar';
import { ErrorState } from '../../app/components/ErrorState';
import { ListSkeleton } from '../../app/components/PageSkeleton';
import { ShelfView } from '../../app/components/ShelfView';

export function SearchPage() {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const query = sp.get('q') ?? '';
  const params = sp.get('params') ?? undefined;
  const q = useSearch(query, params);
  if (!query) return <div className="p-8 text-fg-muted">{t('search.prompt')}</div>;
  if (q.isPending) return <ListSkeleton rows={10} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const first = q.data.pages[0]?.page;
  const shelves = q.data.pages.flatMap((p) => p.shelves);
  return (
    <div className="flex flex-col gap-6 px-2 pb-8">
      <div className="sticky top-0 z-10 pt-4 pb-2 backdrop-blur-xl">
        <ChipBar
          chips={first?.chips ?? []}
          selected={
            first?.chips.find((c) => c.endpoint?.type === 'search' && c.endpoint.params === params)
              ?.text ?? null
          }
          onSelect={(c) => {
            const next = new URLSearchParams(sp);
            if (c?.endpoint?.type === 'search' && c.endpoint.params)
              next.set('params', c.endpoint.params);
            else next.delete('params');
            setSp(next);
          }}
        />
      </div>
      {shelves.map((s) => (
        <ShelfView key={s.id} shelf={s} />
      ))}
      {!shelves.length && (
        <div className="p-8 text-fg-muted">{t('search.noResults', { query })}</div>
      )}
      {q.hasNextPage && (
        <div className="px-2">
          <Button disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {q.isFetchingNextPage ? t('common.loading') : t('common.showMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
