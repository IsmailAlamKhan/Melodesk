import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sent: Record<string, unknown>[] = [];
vi.mock('../../player/ipc', () => ({
  sendCommand: (c: Record<string, unknown>) => {
    sent.push(c);
    return Promise.resolve();
  },
}));
vi.mock('../../app/toast', () => ({ toast: () => undefined }));
vi.mock('../../app/dialogs/store', () => ({ openDialog: () => undefined }));
vi.mock('../../data/innertube', () => ({ run: () => Promise.resolve({}) }));

import { usePlayerStore } from '../../player/store';
import { FADE_MS, fadeVolume, setSleepTimer } from './queueTools';
import { useSleepTimer } from './store';

describe('fadeVolume', () => {
  it('falls in a straight line to nothing', () => {
    expect(fadeVolume(0.8, FADE_MS)).toBeCloseTo(0.8);
    expect(fadeVolume(0.8, FADE_MS / 2)).toBeCloseTo(0.4);
    expect(fadeVolume(0.8, 0)).toBe(0);
    expect(fadeVolume(0.8, -500)).toBe(0);
    expect(fadeVolume(0.8, FADE_MS * 3)).toBeCloseTo(0.8);
  });
});

describe('the sleep timer', () => {
  beforeEach(() => {
    // The code reaches for window.setTimeout; in node the global object is the closest thing.
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers();
    sent.length = 0;
    usePlayerStore.setState({
      state: {
        playing: true,
        position: 10,
        duration: 200,
        volume: 0.6,
        muted: false,
        sampledAt: 0,
      },
    });
  });
  afterEach(() => {
    setSleepTimer(0);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const volumes = (): number[] =>
    sent.filter((c) => c['type'] === 'setVolume').map((c) => c['volume'] as number);

  it('plays at full volume, fades over the last seconds, pauses, and gives the volume back', () => {
    setSleepTimer(1);
    vi.advanceTimersByTime(60_000 - FADE_MS - 1000);
    expect(volumes()).toEqual([]);
    vi.advanceTimersByTime(FADE_MS / 2 + 1000);
    const mid = volumes();
    expect(mid.length).toBeGreaterThan(5);
    expect(mid.at(-1) ?? 1).toBeLessThan(0.45);
    expect(sent.some((c) => c['type'] === 'pause')).toBe(false);
    vi.advanceTimersByTime(FADE_MS);
    expect(sent.some((c) => c['type'] === 'pause')).toBe(true);
    expect(volumes().at(-1)).toBe(0.6);
    expect(useSleepTimer.getState().sleepUntil).toBeNull();
  });

  it('cancelling during the fade brings the volume straight back and never pauses', () => {
    setSleepTimer(1);
    vi.advanceTimersByTime(60_000 - 5000);
    expect(volumes().at(-1) ?? 1).toBeLessThan(0.3);
    setSleepTimer(0);
    expect(volumes().at(-1)).toBe(0.6);
    vi.advanceTimersByTime(120_000);
    expect(sent.some((c) => c['type'] === 'pause')).toBe(false);
  });
});
