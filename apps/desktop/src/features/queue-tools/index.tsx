import { Wrench } from 'lucide-react';
import { defineFeature } from '../../core';
import { QueueToolsMenu } from './QueueToolsMenu';

export default defineFeature({
  id: 'queue-tools',
  name: 'feature.queue-tools.name',
  description: 'feature.queue-tools.description',
  icon: Wrench,
  dependsOn: ['queue'],
  contributes: {
    slots: { 'queue.header': [{ id: 'menu', component: QueueToolsMenu }] },
  },
});
