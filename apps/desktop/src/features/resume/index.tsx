import { History } from 'lucide-react';
import { defineFeature } from '../../core';
import { ResumeCard } from './ResumeCard';
import { startResumeRecorder } from './recorder';

/** Picks up where you left off: a card on Home with the song you were in the middle of. */
export default defineFeature({
  id: 'resume',
  name: 'feature.resume.name',
  description: 'feature.resume.description',
  icon: History,
  contributes: {
    slots: { 'home.top': [{ id: 'resume', order: 10, component: ResumeCard }] },
  },
  start: startResumeRecorder,
});
