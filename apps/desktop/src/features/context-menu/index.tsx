import { MousePointerClick } from 'lucide-react';
import { defineFeature } from '../../core';
import { AppContextMenu } from './AppContextMenu';

export default defineFeature({
  id: 'context-menu',
  name: 'feature.context-menu.name',
  description: 'feature.context-menu.description',
  icon: MousePointerClick,
  // Wraps the whole app, in the main window only. Cards and rows bring their own menus.
  contributes: {
    providers: [{ id: 'menu', order: 50, component: AppContextMenu }],
  },
});
