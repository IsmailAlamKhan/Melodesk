import { Disc3 } from 'lucide-react';
import { defineFeature } from '../../core';
import { RadarCard } from './RadarCard';

/** A card on Home with what the artists you play have released lately. */
export default defineFeature({
  id: 'release-radar',
  name: 'feature.releaseRadar.name',
  description: 'feature.releaseRadar.description',
  icon: Disc3,
  contributes: { slots: { 'home.top': [{ id: 'radar', order: 30, component: RadarCard }] } },
});
