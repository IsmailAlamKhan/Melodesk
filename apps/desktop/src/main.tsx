import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AppRouter } from './app/router';
import { queryClient } from './data/queryClient';
import { shouldPersistQuery, sqlitePersister } from './data/persister';
import { subscribeToPlayer } from './player/ipc';
import './styles.css';

subscribeToPlayer();
if (import.meta.env.DEV && import.meta.env.VITE_CAPTURE_FIXTURES === '1') {
  void import('./dev/capture').then((m) => {
    m.startFixtureCapture();
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: sqlitePersister,
        maxAge: 1000 * 60 * 60 * 24,
        buster: 'v1',
        dehydrateOptions: {
          shouldDehydrateQuery: (q) =>
            q.state.status === 'success' && shouldPersistQuery(q.queryKey),
        },
      }}
    >
      <AppRouter />
    </PersistQueryClientProvider>
  </StrictMode>,
);
