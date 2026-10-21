/** Smart queue tools, all built on the bridge's queue commands (the page keeps the real queue). */
import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { openDialog } from '../../app/dialogs/store';
import { t } from '../../i18n/index';
import { toast } from '../../app/toast';
import { useSleepTimer } from './store';

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
  toast(remove.length ? t('toast.dupesRemoved', { count: remove.length }) : t('toast.noDupes'));
}

export function saveQueueAsPlaylist(): void {
  const queue = usePlayerStore.getState().queue;
  const ids = (queue?.items ?? []).filter((i) => !i.isAutomix).map((i) => i.videoId);
  if (!ids.length) {
    toast(t('toast.queueEmpty'));
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
    useSleepTimer.getState().setSleepUntil(null);
    toast(t('toast.sleepOff'));
    return;
  }
  const until = Date.now() + minutes * 60_000;
  useSleepTimer.getState().setSleepUntil(until);
  sleepTimer = window.setTimeout(() => {
    void sendCommand({ type: 'pause' });
    useSleepTimer.getState().setSleepUntil(null);
    toast(t('toast.sleepPaused'));
  }, minutes * 60_000);
  toast(t('toast.sleepIn', { minutes }));
}

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export async function setPlaybackRate(rate: number): Promise<void> {
  await sendCommand({ type: 'setPlaybackRate', rate });
  toast(t('toast.speed', { rate }));
}
