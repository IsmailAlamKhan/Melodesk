import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { z } from 'zod';
import type { MessageKey } from '../i18n';

/** Mirrors `Settings` in src-tauri/src/settings.rs. */
export const ShortcutsSchema = z.object({
  playPause: z.string().nullable(),
  next: z.string().nullable(),
  previous: z.string().nullable(),
  volumeUp: z.string().nullable(),
  volumeDown: z.string().nullable(),
  mute: z.string().nullable(),
  showHide: z.string().nullable(),
});
export const SettingsSchema = z.object({
  closeToTray: z.boolean(),
  launchAtLogin: z.boolean(),
  notifyOnTrackChange: z.boolean(),
  shortcuts: ShortcutsSchema,
});
export type Settings = z.infer<typeof SettingsSchema>;
export type Shortcuts = z.infer<typeof ShortcutsSchema>;

interface SettingsState {
  settings: Settings | null;
  error: string | null;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  error: null,
  load: async () => {
    try {
      set({ settings: SettingsSchema.parse(await invoke('get_settings')), error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },
  update: async (patch) => {
    const current = get().settings;
    if (!current) return;
    const next = { ...current, ...patch };
    set({ settings: next });
    try {
      await invoke('set_settings', { settings: next });
      set({ error: null });
    } catch (err) {
      set({ settings: current, error: String(err) });
    }
  },
}));

export const SHORTCUT_ACTIONS: { key: keyof Shortcuts; labelKey: MessageKey }[] = [
  { key: 'playPause', labelKey: 'shortcut.playPause' },
  { key: 'next', labelKey: 'shortcut.next' },
  { key: 'previous', labelKey: 'shortcut.previous' },
  { key: 'volumeUp', labelKey: 'shortcut.volumeUp' },
  { key: 'volumeDown', labelKey: 'shortcut.volumeDown' },
  { key: 'mute', labelKey: 'shortcut.mute' },
  { key: 'showHide', labelKey: 'shortcut.showHide' },
];

/** Turn a keydown into Tauri's accelerator syntax, or null for a bare modifier. */
export function acceleratorFromEvent(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.metaKey || e.ctrlKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  const key = e.key;
  if (['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'Dead'].includes(key)) return null;
  const named: Record<string, string> = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Escape',
    Enter: 'Enter',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Tab: 'Tab',
  };
  const name =
    named[key] ?? (key.length === 1 ? key.toUpperCase() : /^F\d{1,2}$/u.test(key) ? key : null);
  if (!name) return null;
  if (!mods.length && !/^F\d{1,2}$/u.test(name)) return null; // a bare letter would hijack typing everywhere
  return [...mods, name].join('+');
}
