import { QueryClient } from '@tanstack/react-query';

/**
 * The account is the source of truth: every query is stale immediately, refetches when the
 * window regains focus, and the persisted cache only serves as a fast first paint
 * (stale-while-revalidate).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 1000 * 60 * 60 * 24,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
      networkMode: 'always',
    },
    mutations: { networkMode: 'always' },
  },
});
