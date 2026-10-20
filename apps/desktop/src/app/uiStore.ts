import { create } from 'zustand';

interface UiState {
  rightPanel: 'queue' | 'lyrics' | null;
  toggleRightPanel: (panel: 'queue' | 'lyrics') => void;
}

export const useUiStore = create<UiState>((set) => ({
  rightPanel: null,
  toggleRightPanel: (panel) => {
    set((s) => ({ rightPanel: s.rightPanel === panel ? null : panel }));
  },
}));
