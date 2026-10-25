import { Cable } from 'lucide-react';
import { defineFeature } from '../../core';
import { ControlSection } from './ControlSection';
import { applyControl, loadControl, useControl } from './control';
import { invoke } from '@tauri-apps/api/core';

/**
 * A control API on this computer (off by default): other programs can ask what is playing and send
 * play, pause, next, previous and volume, with a secret token. See docs/control-api.md.
 */
export default defineFeature({
  id: 'control-api',
  name: 'feature.control-api.name',
  description: 'feature.control-api.description',
  icon: Cable,
  defaultEnabled: true,
  contributes: {
    settings: [{ id: 'control', category: 'general', order: 80, component: ControlSection }],
  },
  start: () => {
    void loadControl().then(() => {
      if (useControl.getState().enabled) void applyControl();
    });
    return () => {
      void invoke('control_stop').catch(() => undefined);
    };
  },
});
