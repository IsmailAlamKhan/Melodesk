import { queryOptions, useQuery } from '@tanstack/react-query';
import { fetchNext } from '../data/innertube';
import { routeForEndpoint } from './actions';
import { usePlayerStore } from './store';

/** What YouTube says about what is playing (up next, lyrics tab, the artists with their pages). */
export const nextQuery = (videoId: string | null) =>
  queryOptions({
    queryKey: ['next', videoId],
    staleTime: 1000 * 60 * 60,
    queryFn: () => fetchNext({ videoId: videoId ?? '' }),
  });

export interface ArtistLink {
  name: string;
  route: string;
}

/** The current track's artists, each with the page it opens (empty until YouTube has answered). */
export function useTrackArtists(): ArtistLink[] {
  const videoId = usePlayerStore((s) => s.track?.videoId ?? null);
  const ready = usePlayerStore((s) => s.ready);
  const { data } = useQuery({ ...nextQuery(videoId), enabled: ready && videoId !== null });
  const current = data?.items.find(
    (i) => (i.kind === 'song' || i.kind === 'video') && i.videoId === videoId,
  );
  if (!current || (current.kind !== 'song' && current.kind !== 'video')) return [];
  return current.artists.flatMap((a) => {
    const route = routeForEndpoint(a.endpoint);
    return route ? [{ name: a.name, route }] : [];
  });
}
