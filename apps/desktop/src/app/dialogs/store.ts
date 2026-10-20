import { create } from 'zustand';

export type DialogRequest =
  | { type: 'createPlaylist'; videoIds?: string[] | undefined }
  | {
      type: 'editPlaylist';
      playlistId: string;
      title: string;
      description: string;
      privacy: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
    }
  | { type: 'addToPlaylist'; videoIds: string[]; label?: string | undefined }
  | {
      type: 'confirm';
      title: string;
      body: string;
      confirmLabel: string;
      danger?: boolean | undefined;
      onConfirm: () => void | Promise<void>;
    };

interface DialogState {
  current: DialogRequest | null;
  open: (d: DialogRequest) => void;
  close: () => void;
}

/** One global dialog host so menus, headers and the sidebar can open dialogs without prop drilling. */
export const useDialogs = create<DialogState>((set) => ({
  current: null,
  open: (d) => {
    set({ current: d });
  },
  close: () => {
    set({ current: null });
  },
}));

export const openDialog = (d: DialogRequest): void => {
  useDialogs.getState().open(d);
};
