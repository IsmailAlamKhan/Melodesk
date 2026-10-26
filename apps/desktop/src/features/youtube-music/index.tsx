import { Music2 } from 'lucide-react';
import { registerBackend } from '../../player/backends';
import { defineFeature } from '../../core';
import { youtubeBackend } from './backend';

// Registered when the module loads, in every window, so the listeners can start before anything else
// runs (the player may report itself at once). See `subscribeToPlayer` in player/ipc.ts.
registerBackend(youtubeBackend);

/**
 * YouTube Music as a source of playback. The official web player (music.youtube.com, in a hidden
 * window) does the playing, signing in and ads; this feature is how the rest of the app talks to it.
 * It is a source like any other (your own music, a music server…), registered in the backend list in
 * `player/backends.ts`, not what the player is built on. The pages that browse YouTube Music still
 * need it, so it cannot be switched off yet.
 */
export default defineFeature({
  id: 'youtube-music',
  name: 'feature.youtubeMusic.name',
  description: 'feature.youtubeMusic.description',
  icon: Music2,
  core: true,
  scope: 'all',
});
