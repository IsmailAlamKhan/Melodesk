import { create } from 'zustand';

export type LyricsStepState = 'running' | 'found' | 'none' | 'slow' | 'failed';

export interface LyricsStep {
  id: string;
  /** What is being asked: a source's name. Already a display name, so not translated. */
  label: string;
  state: LyricsStepState;
  /** What it is trying right now, for example the title it is looking up. */
  detail?: string;
}

interface Progress {
  videoId: string | null;
  steps: LyricsStep[];
}

export const useLyricsProgress = create<Progress>(() => ({ videoId: null, steps: [] }));

/**
 * What a lyrics lookup is doing, so the view can show it instead of a bare "loading". Updates carry
 * the song they are for, and one for a song that is no longer the current lookup is ignored.
 */
export const lyricsProgress = {
  begin(videoId: string): void {
    useLyricsProgress.setState({ videoId, steps: [] });
  },
  step(videoId: string, step: LyricsStep): void {
    useLyricsProgress.setState((s) => {
      if (s.videoId !== videoId) return s;
      const i = s.steps.findIndex((x) => x.id === step.id);
      const steps = [...s.steps];
      if (i < 0) steps.push(step);
      else steps[i] = step;
      return { steps };
    });
  },
};
