import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AppRouter } from './app/router';
import { discoverFeatures, useFeatures, useWindowComponent } from './core';
import { AppearanceEffects } from './appearance/Effects';
import { queryClient } from './data/queryClient';
import { shouldPersistQuery, sqlitePersister } from './data/persister';
import { subscribeToPlayer } from './player/ipc';
import { useSettings } from './settings/store';
import { handleIncomingUrl } from './app/openUrl';
import { router } from './app/router';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import './styles.css';

// Platform hint for CSS (translucent sidebar over macOS vibrancy, native scrollbars…).
document.documentElement.dataset['platform'] = navigator.userAgent.includes('Macintosh')
  ? 'macos'
  : navigator.userAgent.includes('Windows')
    ? 'windows'
    : 'linux';
/** The name of an extra native window this page is (`mini`, `lyrics`), or null in the main window. */
function extraWindowName(): string | null {
  const name = new URLSearchParams(window.location.search).get('window');
  return name === 'mini' || name === 'lyrics' ? name : null;
}

// Assemble the app from its features (every folder in src/features) before anything renders.
useFeatures.getState().register(discoverFeatures(), { deferStart: true });
void useFeatures.getState().load();
subscribeToPlayer();
void useSettings.getState().load();
// Deep links: cold start (getCurrent) and while running (onOpenUrl / the Rust forwarder).
void getCurrent()
  .then((urls) => urls?.forEach(handleIncomingUrl))
  .catch(() => undefined);
void onOpenUrl((urls) => urls.forEach(handleIncomingUrl)).catch(() => undefined);
void listen<string[]>('app:open-url', (e) => e.payload.forEach(handleIncomingUrl));
void listen<string>('app:navigate', (e) => void router.navigate(e.payload));
// Dev aid: VITE_DEV_MINI=1 opens the mini player on launch.
if (import.meta.env.DEV && import.meta.env.VITE_DEV_MINI === '1') void invoke('open_mini_player');
if (import.meta.env.DEV && import.meta.env.VITE_CAPTURE_FIXTURES === '1') {
  void import('./dev/capture').then((m) => {
    m.startFixtureCapture();
  });
}

if (import.meta.env.DEV && import.meta.env.VITE_AUDIO_SELFTEST === '1') {
  void import('./dev/capture').then((m) => m.startAudioSelfTest());
}

/** The content of an extra native window, provided by whichever feature owns it (here: `mini`). */
function WindowHost({ name }: { name: string }) {
  const Window = useWindowComponent(name);
  return Window ? createElement(Window) : null;
}

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
const extraWindow = extraWindowName();
if (extraWindow) document.documentElement.dataset['window'] = extraWindow;

createRoot(root).render(
  extraWindow ? (
    <StrictMode>
      <AppearanceEffects>
        <WindowHost name={extraWindow} />
      </AppearanceEffects>
    </StrictMode>
  ) : (
    <StrictMode>
      <AppearanceEffects>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: sqlitePersister,
            maxAge: 1000 * 60 * 60 * 24,
            buster: 'v1',
            dehydrateOptions: {
              shouldDehydrateQuery: (q) =>
                q.state.status === 'success' && shouldPersistQuery(q.queryKey, q.state.data),
            },
          }}
        >
          <AppRouter />
        </PersistQueryClientProvider>
      </AppearanceEffects>
    </StrictMode>
  ),
);
