import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AppRouter } from './app/router';
import { queryClient } from './data/queryClient';
import { shouldPersistQuery, sqlitePersister } from './data/persister';
import { subscribeToPlayer } from './player/ipc';
import { useSettings } from './settings/store';
import { startPluginHost } from './plugins/host';
import { handleIncomingUrl } from './app/openUrl';
import { router } from './app/router';
import { listen } from '@tauri-apps/api/event';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import './styles.css';

// Platform hint for CSS (translucent sidebar over macOS vibrancy, native scrollbars…).
document.documentElement.dataset['platform'] = navigator.userAgent.includes('Macintosh')
  ? 'macos'
  : navigator.userAgent.includes('Windows')
    ? 'windows'
    : 'linux';
subscribeToPlayer();
void useSettings.getState().load();
void startPluginHost().catch((err: unknown) => {
  console.error('plugin host failed', err);
});
// Deep links: cold start (getCurrent) and while running (onOpenUrl / the Rust forwarder).
void getCurrent()
  .then((urls) => urls?.forEach(handleIncomingUrl))
  .catch(() => undefined);
void onOpenUrl((urls) => urls.forEach(handleIncomingUrl)).catch(() => undefined);
void listen<string[]>('app:open-url', (e) => e.payload.forEach(handleIncomingUrl));
void listen<string>('app:navigate', (e) => void router.navigate(e.payload));
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
