import { Keyboard } from 'lucide-react';
import { defineFeature } from '../../core';
import { ShortcutsSection } from './ShortcutsSection';

export default defineFeature({
  id: 'global-shortcuts',
  name: 'feature.global-shortcuts.name',
  description: 'feature.global-shortcuts.description',
  icon: Keyboard,
  // The OS-level hotkeys live in the native shell; builds without that module hide the settings.
  requires: ['shortcuts'],
  contributes: {
    settings: [{ id: 'shortcuts', category: 'general', order: 40, component: ShortcutsSection }],
  },
});
