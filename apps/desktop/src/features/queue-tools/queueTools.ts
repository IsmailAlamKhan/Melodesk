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

/** The last seconds before the timer ends are a fade-out, not a sudden stop. */
export const FADE_MS = 20_000;
const FADE_TICK_MS = 500;

/** The volume `remainingMs` before the end of a fade that started at `before`. */
export function fadeVolume(before: number, remainingMs: number, fadeMs = FADE_MS): number {
  return before * Math.min(1, Math.max(0, remainingMs / fadeMs));
}

let sleepTimer: number | null = null;
let fadeStart: number | null = null;
let fadeInterval: number | null = null;
/** The volume to give back when a fade ends or is cancelled, while one is under way. */
let volumeBeforeFade: number | null = null;

function endFade(restore: boolean): void {
  if (fadeStart !== null) window.clearTimeout(fadeStart);
  fadeStart = null;
  if (fadeInterval !== null) window.clearInterval(fadeInterval);
  fadeInterval = null;
  if (restore && volumeBeforeFade !== null)
    void sendCommand({ type: 'setVolume', volume: volumeBeforeFade });
  volumeBeforeFade = null;
}

/**
 * Fade out and pause after `minutes` (0 cancels). The volume comes back afterwards, so the next song
 * is not played silently. State is mirrored in the UI store for display.
 */
export function setSleepTimer(minutes: number): void {
  if (sleepTimer !== null) window.clearTimeout(sleepTimer);
  sleepTimer = null;
  endFade(true);
  if (minutes <= 0) {
    useSleepTimer.getState().setSleepUntil(null);
    toast(t('toast.sleepOff'));
    return;
  }
  const total = minutes * 60_000;
  const until = Date.now() + total;
  useSleepTimer.getState().setSleepUntil(until);
  const startFade = (): void => {
    volumeBeforeFade = usePlayerStore.getState().state?.volume ?? 1;
    const before = volumeBeforeFade;
    fadeInterval = window.setInterval(() => {
      void sendCommand({ type: 'setVolume', volume: fadeVolume(before, until - Date.now()) });
    }, FADE_TICK_MS);
  };
  fadeStart = window.setTimeout(startFade, Math.max(0, total - FADE_MS));
  sleepTimer = window.setTimeout(() => {
    void sendCommand({ type: 'pause' });
    endFade(true);
    useSleepTimer.getState().setSleepUntil(null);
    toast(t('toast.sleepPaused'));
  }, total);
  toast(t('toast.sleepIn', { minutes }));
}

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export async function setPlaybackRate(rate: number): Promise<void> {
  await sendCommand({ type: 'setPlaybackRate', rate });
  toast(t('toast.speed', { rate }));
}
