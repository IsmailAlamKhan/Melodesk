import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { DEFAULT_AUDIO, toConfig, useAudioPrefs } from '../../audio/store';

/**
 * Loads the saved audio settings and keeps the player's audio engine in step with them. Returns a
 * function that stops syncing and puts the engine back to neutral.
 */
export function startAudioSync(): () => void {
  void useAudioPrefs.getState().load();
  const push = (): void => {
    const prefs = useAudioPrefs.getState();
    if (!usePlayerStore.getState().ready || !prefs.loaded) return;
    // A neutral config is harmless: the engine only touches the media element when asked to process.
    void sendCommand({ type: 'setAudio', config: toConfig(prefs) }).catch(() => undefined);
  };
  const offPrefs = useAudioPrefs.subscribe(push);
  const offPlayer = usePlayerStore.subscribe((s, prev) => {
    if (s.ready && !prev.ready) push();
  });
  push();
  return () => {
    offPrefs();
    offPlayer();
    void sendCommand({ type: 'setAudio', config: toConfig(DEFAULT_AUDIO) }).catch(() => undefined);
  };
}
