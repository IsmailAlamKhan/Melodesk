import { create } from 'zustand';

interface KaraokeState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useKaraoke = create<KaraokeState>((set) => ({
  open: false,
  setOpen: (open) => {
    set({ open });
  },
}));
