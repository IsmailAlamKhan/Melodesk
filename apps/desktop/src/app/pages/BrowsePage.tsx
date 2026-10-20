import { useParams, useSearchParams } from 'react-router';
import { useBrowse } from '../../data/hooks';
import { ChipBar } from '../components/ChipBar';
import { ErrorState } from '../components/ErrorState';
import { PageHeaderView } from '../components/PageHeaderView';
import { PageSkeleton } from '../components/PageSkeleton';
import { ShelfView } from '../components/ShelfView';
import { useNavigate } from 'react-router';
import { routeForEndpoint } from '../../player/actions';

/** Generic page for any browse id: explore, charts, moods, categories, podcasts, "show all" lists… */
export function BrowsePage({ browseId: fixedId, title }: { browseId?: string; title?: string }) {
  const params = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const browseId = fixedId ?? decodeURIComponent(params['browseId'] ?? '');
  const q = useBrowse(browseId, search.get('params') ?? undefined);
  if (q.isPending) return <PageSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const page = q.data;
  const heading = page.header?.title ?? title;
  return (
    <div className="flex flex-col gap-8 pb-8">
      {page.header && page.header.thumbnails.length > 0 ? (
        <PageHeaderView header={page.header} />
      ) : (
        heading && (
          <h1 className="px-4 pt-6 font-display text-3xl font-bold tracking-tight">{heading}</h1>
        )
      )}
      {page.chips.length > 0 && (
        <ChipBar
          chips={page.chips}
          onSelect={(c) => {
            const route = c ? routeForEndpoint(c.endpoint) : null;
            if (route) void navigate(route);
          }}
        />
      )}
      <div className="flex flex-col gap-8 px-2">
        {page.shelves.map((s) => (
          <ShelfView key={s.id} shelf={s} />
        ))}
      </div>
    </div>
  );
}
