import { create } from 'zustand';

interface UiState {
  rightPanel: 'queue' | 'lyrics' | null;
  toggleRightPanel: (panel: 'queue' | 'lyrics') => void;
  nowPlayingOpen: boolean;
  setNowPlayingOpen: (open: boolean) => void;
}

/** Dev aid: VITE_DEV_PANEL=queue|lyrics opens that panel on launch. */
function devPanel(): 'queue' | 'lyrics' | null {
  if (!import.meta.env.DEV) return null;
  const v: unknown = import.meta.env.VITE_DEV_PANEL;
  return v === 'queue' || v === 'lyrics' ? v : null;
}

export const useUiStore = create<UiState>((set) => ({
  rightPanel: devPanel(),
  nowPlayingOpen: false,
  setNowPlayingOpen: (open) => {
    set({ nowPlayingOpen: open });
  },
  toggleRightPanel: (panel) => {
    set((s) => ({ rightPanel: s.rightPanel === panel ? null : panel }));
  },
}));
