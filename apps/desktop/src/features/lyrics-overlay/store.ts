import { create } from 'zustand';

/** Whether the floating lyrics window is open (the main window only feeds it while it is). */
export const useOverlay = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => {
    set({ open });
  },
}));
