import { HardDrive, Info, Palette, Plug, Puzzle, Settings2, type LucideIcon } from 'lucide-react';
import type { MessageKey } from '../../i18n';

/** The pages of Settings, in the order they are listed. Sections pick one with `category`. */
export interface SettingsCategory {
  id: string;
  label: MessageKey;
  icon: LucideIcon;
}

export const CATEGORIES: SettingsCategory[] = [
  { id: 'general', label: 'settings.cat.general', icon: Settings2 },
  { id: 'appearance', label: 'settings.cat.appearance', icon: Palette },
  { id: 'features', label: 'settings.cat.features', icon: Puzzle },
  { id: 'plugins', label: 'settings.cat.plugins', icon: Plug },
  { id: 'storage', label: 'settings.cat.storage', icon: HardDrive },
  { id: 'about', label: 'settings.cat.about', icon: Info },
];

export const DEFAULT_CATEGORY = 'general';
