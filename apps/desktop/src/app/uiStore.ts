import { create } from 'zustand';

interface UiState {
  rightPanel: 'queue' | 'lyrics' | null;
  toggleRightPanel: (panel: 'queue' | 'lyrics') => void;
}

export const useUiStore = create<UiState>((set) => ({
  // Dev aid: VITE_DEV_PANEL=queue|lyrics opens that panel on launch.
  rightPanel:
    import.meta.env.DEV &&
    (import.meta.env.VITE_DEV_PANEL === 'queue' || import.meta.env.VITE_DEV_PANEL === 'lyrics')
      ? import.meta.env.VITE_DEV_PANEL
      : null,
  toggleRightPanel: (panel) => {
    set((s) => ({ rightPanel: s.rightPanel === panel ? null : panel }));
  },
}));
