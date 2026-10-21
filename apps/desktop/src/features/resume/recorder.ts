import { usePlayerStore } from '../../player/store';
import { save, worthResuming } from './saved';

const EVERY_MS = 15_000;

/** Remember what is playing, and how far in, every so often and when it is paused or changes. */
export function startResumeRecorder(): () => void {
  let lastWrite = 0;
  const write = (): void => {
    const { track, state, queue } = usePlayerStore.getState();
    if (!track?.videoId || !state) return;
    const position =
      state.position + (state.playing ? Math.max(0, Date.now() - state.sampledAt) / 1000 : 0);
    if (!worthResuming(position, state.duration)) return;
    lastWrite = Date.now();
    void save({
      videoId: track.videoId,
      title: track.title,
      artist: track.artist,
      artworkUrl: track.artworkUrl,
      position: Math.floor(position),
      duration: Math.round(state.duration),
      endpoint: queue?.items[queue.index]?.endpoint ?? null,
      savedAt: Date.now(),
    }).catch(() => undefined);
  };
  const unsub = usePlayerStore.subscribe((s, prev) => {
    const paused = prev.state?.playing === true && s.state?.playing === false;
    const changed = s.track?.videoId !== prev.track?.videoId;
    if (paused || (!changed && Date.now() - lastWrite >= EVERY_MS && s.state?.playing)) write();
  });
  return () => {
    unsub();
    write();
  };
}
