import { create } from 'zustand';
import type { Release } from './releases';

interface WhatsNewState {
  /** What the open window lists; null while it is closed. */
  shown: { releases: Release[]; afterUpdate: boolean } | null;
  show: (releases: Release[], afterUpdate: boolean) => void;
  close: () => void;
}

export const useWhatsNew = create<WhatsNewState>((set) => ({
  shown: null,
  show: (releases, afterUpdate) => {
    set({ shown: { releases, afterUpdate } });
  },
  close: () => {
    set({ shown: null });
  },
}));
