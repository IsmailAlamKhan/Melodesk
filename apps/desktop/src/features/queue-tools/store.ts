import { create } from 'zustand';

interface SleepTimerState {
  /** When the sleep timer will pause playback (epoch ms), or null when none is set. */
  sleepUntil: number | null;
  setSleepUntil: (until: number | null) => void;
}

export const useSleepTimer = create<SleepTimerState>((set) => ({
  sleepUntil: null,
  setSleepUntil: (until) => {
    set({ sleepUntil: until });
  },
}));
