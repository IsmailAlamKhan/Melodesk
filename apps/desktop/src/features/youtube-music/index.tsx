import { Music2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { defineFeature } from '../../core';
import { windowKind } from '../../core/registry';
import { attachBackend, detachBackend, registerBackend } from '../../player/backends';
import { usePlayerStore } from '../../player/store';
import { AccountSection } from './AccountSection';
import { SOURCE_ID, youtubeBackend } from './backend';
import { DiagnosticsSection } from './DiagnosticsSection';

// Registered when the module loads, in every window, so the listeners can start before anything else
// runs (the player may report itself at once). See `subscribeToPlayer` in player/ipc.ts.
registerBackend(youtubeBackend);

/**
 * YouTube Music as a source of playback, and the pages that browse it (home, search, library…, which
 * depend on this). The official web player (music.youtube.com, in a hidden window) does the playing,
 * signing in and ads. Switch it off and the hidden window is closed, nothing is sent to YouTube, and
 * the app is what is left: your own music, servers, podcasts and radio.
 */
export default defineFeature({
  id: 'youtube-music',
  name: 'feature.youtubeMusic.name',
  description: 'feature.youtubeMusic.description',
  icon: Music2,
  scope: 'all',
  contributes: {
    settings: [
      { id: 'account', category: 'general', order: 10, component: AccountSection },
      { id: 'diagnostics', category: 'about', order: 80, component: DiagnosticsSection },
    ],
  },
  start: () => {
    attachBackend(SOURCE_ID);
    // Only the main window owns the hidden player window (the mini player is just another view).
    if (windowKind() === 'main') void invoke('youtube_set_enabled', { enabled: true });
    return () => {
      detachBackend(SOURCE_ID);
      if (windowKind() === 'main') void invoke('youtube_set_enabled', { enabled: false });
      // What it last reported is not what is playing any more.
      const s = usePlayerStore.getState();
      if (s.source === SOURCE_ID)
        usePlayerStore.setState({
          source: '',
          ready: false,
          loggedIn: false,
          track: null,
          state: null,
          queue: null,
          flags: null,
        });
    };
  },
});
