import { registerLocalLyrics } from './lyrics';
import { startLocalPlayer } from './engine';
import { loadFolders, rescan } from './scan';

/** Starts the local player and the lyrics source for local songs, and reads the folders once the app has settled. */
export function startLocalMusic(): () => void {
  const stopPlayer = startLocalPlayer();
  const stopLyrics = registerLocalLyrics();
  // Not at once: starting the app comes first. Only when there are folders to read.
  const timer = window.setTimeout(() => {
    void loadFolders().then((folders) => {
      if (folders.length > 0) void rescan();
    });
  }, 4000);
  return () => {
    window.clearTimeout(timer);
    stopLyrics();
    stopPlayer();
  };
}
