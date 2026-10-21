import { create } from 'zustand';

interface NowPlayingState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useNowPlaying = create<NowPlayingState>((set) => ({
  open: false,
  setOpen: (open) => {
    set({ open });
  },
}));
