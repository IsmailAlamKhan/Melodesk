import { useEffect } from 'react';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';
import { toConfig, useAudioPrefs } from './store';

/** Loads the saved audio settings and keeps the player's audio engine in step with them. */
export function useAudioSync(): void {
  const ready = usePlayerStore((s) => s.ready);
  const loaded = useAudioPrefs((s) => s.loaded);
  const eqEnabled = useAudioPrefs((s) => s.eqEnabled);
  const preampDb = useAudioPrefs((s) => s.preampDb);
  const gainsDb = useAudioPrefs((s) => s.gainsDb);
  const normalize = useAudioPrefs((s) => s.normalize);

  useEffect(() => {
    void useAudioPrefs.getState().load();
  }, []);

  useEffect(() => {
    if (!ready || !loaded) return;
    // A neutral config is harmless: the engine only touches the media element when asked to process.
    void sendCommand({
      type: 'setAudio',
      config: toConfig({ eqEnabled, preampDb, gainsDb, normalize }),
    }).catch(() => undefined);
  }, [ready, loaded, eqEnabled, preampDb, gainsDb, normalize]);
}
