/** Smart queue tools, all built on the bridge's queue commands (the page keeps the real queue). */
import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { openDialog } from '../dialogs/store';
import { toast } from '../toast';
import { useUiStore } from '../uiStore';

/** Remove later duplicates of the same video from the user's part of the queue. */
export async function dedupeQueue(): Promise<void> {
  const queue = usePlayerStore.getState().queue;
  if (!queue) return;
  const seen = new Set<string>();
  const remove: number[] = [];
  queue.items.forEach((it, i) => {
    if (it.isAutomix) return;
    if (seen.has(it.videoId) && i !== queue.index) remove.push(i);
    else seen.add(it.videoId);
  });
  // Remove from the end so earlier indices stay valid.
  for (const i of remove.reverse()) await sendCommand({ type: 'queueRemove', index: i });
  toast(
    remove.length
      ? `Removed ${String(remove.length)} duplicate${remove.length === 1 ? '' : 's'}`
      : 'No duplicates in the queue',
  );
}

export function saveQueueAsPlaylist(): void {
  const queue = usePlayerStore.getState().queue;
  const ids = (queue?.items ?? []).filter((i) => !i.isAutomix).map((i) => i.videoId);
  if (!ids.length) {
    toast('The queue is empty');
    return;
  }
  openDialog({ type: 'createPlaylist', videoIds: ids });
}

let sleepTimer: number | null = null;

/** Pause playback after `minutes` (0 cancels). State is mirrored in the UI store for display. */
export function setSleepTimer(minutes: number): void {
  if (sleepTimer !== null) window.clearTimeout(sleepTimer);
  sleepTimer = null;
  if (minutes <= 0) {
    useUiStore.getState().setSleepUntil(null);
    toast('Sleep timer off');
    return;
  }
  const until = Date.now() + minutes * 60_000;
  useUiStore.getState().setSleepUntil(until);
  sleepTimer = window.setTimeout(() => {
    void sendCommand({ type: 'pause' });
    useUiStore.getState().setSleepUntil(null);
    toast('Sleep timer: paused');
  }, minutes * 60_000);
  toast(`Pausing in ${String(minutes)} min`);
}

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export async function setPlaybackRate(rate: number): Promise<void> {
  await sendCommand({ type: 'setPlaybackRate', rate });
  toast(`Speed ${String(rate)}×`);
}
