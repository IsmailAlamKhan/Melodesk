import { create } from 'zustand';

interface UiState {
  /** Id of the panel open in the right-hand column (contributed by a feature), or null. */
  rightPanel: string | null;
  toggleRightPanel: (id: string) => void;
  closeRightPanel: () => void;
}

/** Dev aid: VITE_DEV_PANEL=queue|lyrics opens that panel on launch. */
function devPanel(): string | null {
  if (!import.meta.env.DEV) return null;
  const v: unknown = import.meta.env.VITE_DEV_PANEL;
  return typeof v === 'string' && v !== '' ? v : null;
}

export const useUiStore = create<UiState>((set) => ({
  rightPanel: devPanel(),
  toggleRightPanel: (id) => {
    set((s) => ({ rightPanel: s.rightPanel === id ? null : id }));
  },
  closeRightPanel: () => {
    set({ rightPanel: null });
  },
}));
