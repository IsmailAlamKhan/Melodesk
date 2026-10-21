import { useEffect, useState } from 'react';
import { usePlayerStore } from './store';

/** Playback position in ms, interpolated between bridge samples; ticks often enough to switch lyric lines promptly. */
export function usePositionMs(tickMs = 80): number {
  const state = usePlayerStore((s) => s.state);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state?.playing) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, tickMs);
    return () => {
      window.clearInterval(id);
    };
  }, [state?.playing, tickMs]);
  if (!state) return 0;
  return (
    (state.playing ? state.position + Math.max(0, now - state.sampledAt) / 1000 : state.position) *
    1000
  );
}
