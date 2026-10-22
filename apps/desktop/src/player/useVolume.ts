import { create } from 'zustand';
import { sendCommand } from './ipc';
import { usePlayerStore } from './store';

/** Where the thumb is while it is being dragged; null when it is at rest. */
const useDragging = create<{ value: number | null }>(() => ({ value: null }));

const LIVE_EVERY_MS = 60;
let lastSent = 0;

/**
 * The props of a volume slider. The thumb follows the drag, the sound follows it too (not only
 * after the release), and moving it while muted un-mutes, as every player does.
 */
export function useVolume() {
  const volume = usePlayerStore((s) => s.state?.volume ?? 1);
  const muted = usePlayerStore((s) => s.state?.muted ?? false);
  const dragging = useDragging((s) => s.value);

  const apply = (v: number): void => {
    void sendCommand({ type: 'setVolume', volume: v });
    if (v > 0 && usePlayerStore.getState().state?.muted)
      void sendCommand({ type: 'setMuted', muted: false });
  };

  return {
    value: dragging ?? (muted ? 0 : volume),
    onChange: (v: number): void => {
      useDragging.setState({ value: v });
      const now = Date.now();
      if (now - lastSent >= LIVE_EVERY_MS) {
        lastSent = now;
        apply(v);
      }
    },
    onCommit: (v: number): void => {
      useDragging.setState({ value: null });
      apply(v);
    },
  };
}
