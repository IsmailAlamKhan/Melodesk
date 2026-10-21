import { Sparkles } from 'lucide-react';
import { defineFeature } from '../../core';
import { Tips } from './Tips';

/** A few pointers for a new user, on Home until they are dismissed. */
export default defineFeature({
  id: 'first-run',
  name: 'feature.first-run.name',
  description: 'feature.first-run.description',
  icon: Sparkles,
  contributes: {
    slots: { 'home.top': [{ id: 'tips', order: 20, component: Tips }] },
  },
});
