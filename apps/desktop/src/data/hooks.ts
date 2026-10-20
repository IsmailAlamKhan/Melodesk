import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import type { Account, Page, Shelf, Suggestion } from '@melodesk/adapter';
import { usePlayerStore } from '../player/store';
import {
  fetchAccount,
  fetchBrowse,
  fetchContinuation,
  fetchSearch,
  fetchSearchContinuation,
  fetchSuggestions,
} from './innertube';

/** Queries can only run once the bridge is attached to the player page. */
export function useBridgeReady(): boolean {
  return usePlayerStore((s) => s.ready);
}

export const keys = {
  browse: (browseId: string, params?: string) => ['browse', browseId, params ?? ''] as const,
  search: (q: string, params?: string) => ['search', q, params ?? ''] as const,
  suggestions: (input: string) => ['suggestions', input] as const,
  account: () => ['account'] as const,
};

export function useBrowse(browseId: string, params?: string) {
  const ready = useBridgeReady();
  return useQuery({
    queryKey: keys.browse(browseId, params),
    queryFn: () => fetchBrowse(browseId, params),
    enabled: ready,
  });
}

interface PageChunk {
  shelves: Shelf[];
  continuation: string | null;
  page?: Page;
}

/** Browse pages with "load more" (home feed, long playlists): first page + continuation chunks. */
export function useInfiniteBrowse(browseId: string, params?: string) {
  const ready = useBridgeReady();
  return useInfiniteQuery<
    PageChunk,
    Error,
    InfiniteData<PageChunk>,
    readonly unknown[],
    string | null
  >({
    queryKey: [...keys.browse(browseId, params), 'infinite'],
    enabled: ready,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      if (pageParam) {
        const c = await fetchContinuation(pageParam);
        return { shelves: c.shelves, continuation: c.continuation };
      }
      const page = await fetchBrowse(browseId, params);
      // A single long shelf (playlist tracks) continues at the shelf level.
      const shelfCont = page.shelves.length === 1 ? (page.shelves[0]?.continuation ?? null) : null;
      return { shelves: page.shelves, continuation: page.continuation ?? shelfCont, page };
    },
    getNextPageParam: (last) => last.continuation,
  });
}

export function useSearch(query: string, params?: string) {
  const ready = useBridgeReady();
  return useInfiniteQuery<
    PageChunk,
    Error,
    InfiniteData<PageChunk>,
    readonly unknown[],
    string | null
  >({
    queryKey: [...keys.search(query, params), 'infinite'],
    enabled: ready && query.trim().length > 0,
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      if (pageParam) {
        const c = await fetchSearchContinuation(pageParam);
        return { shelves: c.shelves, continuation: c.continuation };
      }
      const page = await fetchSearch(query, params);
      return { shelves: page.shelves, continuation: page.continuation, page };
    },
    getNextPageParam: (last) => last.continuation,
    staleTime: 60_000,
  });
}

export function useSuggestions(input: string) {
  const ready = useBridgeReady();
  return useQuery<Suggestion[]>({
    queryKey: keys.suggestions(input),
    queryFn: () => fetchSuggestions(input),
    enabled: ready && input.trim().length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useAccount() {
  const ready = useBridgeReady();
  const loggedIn = usePlayerStore((s) => s.loggedIn);
  return useQuery<Account>({
    queryKey: [...keys.account(), loggedIn],
    queryFn: fetchAccount,
    enabled: ready,
  });
}
