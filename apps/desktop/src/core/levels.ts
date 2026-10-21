import { useEffect, type RefObject } from 'react';

/**
 * A live reading of how loud the music is, for visuals that move with it. One source produces it
 * (a feature registers one while it is on), and any number of small decorative elements follow it
 * through CSS variables set on themselves, so nothing re-renders in React and only those elements
 * are restyled. The loop runs only while something is listening, the window is visible and the
 * source says music is playing.
 */
export const BAND_COUNT = 32;

export interface Levels {
  /** Low to high pitch, 0..1. */
  bands: Float32Array;
  /** Overall loudness, 0..1. */
  energy: number;
  /** The low end, 0..1: the kick and the bass. */
  bass: number;
  /** 1 on a beat, falling away quickly. */
  beat: number;
}

export interface LevelSource {
  id: string;
  /** Whether sound is playing now (and the user has not asked for less motion). */
  isPlaying: () => boolean;
  /** Fill `out` with the levels at `nowMs`. */
  sample: (nowMs: number, out: Levels) => void;
  /** True when the numbers come from the actual audio, false when they only follow the rhythm. */
  real: boolean;
}

export const emptyLevels = (): Levels => ({
  bands: new Float32Array(BAND_COUNT),
  energy: 0,
  bass: 0,
  beat: 0,
});

const FRAME_MS = 1000 / 30;
const IDLE_POLL_MS = 300;
const ATTACK = 0.6;
const RELEASE = 0.15;

const current = emptyLevels();
const scratch = emptyLevels();
const listeners = new Set<(levels: Levels) => void>();
let source: LevelSource | null = null;
let raf = 0;
let idleTimer = 0;
let lastFrame = 0;

const ease = (from: number, to: number): number =>
  from + (to - from) * (to > from ? ATTACK : RELEASE);

function stop(): void {
  if (raf) cancelAnimationFrame(raf);
  if (idleTimer) window.clearTimeout(idleTimer);
  raf = 0;
  idleTimer = 0;
}

function settled(): boolean {
  return current.energy < 0.004 && current.bass < 0.004 && current.beat < 0.004;
}

function frame(now: number): void {
  raf = 0;
  if (now - lastFrame >= FRAME_MS) {
    lastFrame = now;
    const playing = source?.isPlaying() ?? false;
    if (playing && source) source.sample(Date.now(), scratch);
    for (let i = 0; i < BAND_COUNT; i += 1)
      current.bands[i] = ease(current.bands[i] ?? 0, playing ? (scratch.bands[i] ?? 0) : 0);
    current.energy = ease(current.energy, playing ? scratch.energy : 0);
    current.bass = ease(current.bass, playing ? scratch.bass : 0);
    current.beat = ease(current.beat, playing ? scratch.beat : 0);
    for (const cb of listeners) cb(current);
    if (!playing && settled()) {
      schedule();
      return;
    }
  }
  raf = requestAnimationFrame(frame);
}

/** Pick the right mode: animating, or just checking now and then whether music started. */
function schedule(): void {
  stop();
  if (listeners.size === 0 || !source) return;
  if (document.hidden) {
    idleTimer = window.setTimeout(schedule, IDLE_POLL_MS);
    return;
  }
  if (source.isPlaying() || !settled()) raf = requestAnimationFrame(frame);
  else idleTimer = window.setTimeout(schedule, IDLE_POLL_MS);
}

if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    schedule();
  });

/** Make `next` the source of levels (null for none); returns a function that removes it. */
export function setLevelSource(next: LevelSource | null): () => void {
  source = next;
  schedule();
  return () => {
    if (source === next) {
      source = null;
      schedule();
    }
  };
}

/** Whether anything is producing levels (so decorations can leave themselves out when not). */
export function hasLevelSource(): boolean {
  return source !== null;
}

export function getLevelSource(): LevelSource | null {
  return source;
}

/** Be called with the levels on every frame while music plays. Returns the unsubscribe. */
export function subscribeLevels(cb: (levels: Levels) => void): () => void {
  listeners.add(cb);
  schedule();
  return () => {
    listeners.delete(cb);
    schedule();
  };
}

/** Mean of `bands[from, to)`. */
export function bandMean(levels: Levels, from: number, to: number): number {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += levels.bands[i] ?? 0;
  return to > from ? sum / (to - from) : 0;
}

/**
 * Keep CSS variables on `ref`'s element in step with the music: `--energy`, `--bass`, `--beat`, and
 * with `bars: n`, `--b0` … `--b{n-1}` (the spectrum folded into n bars). Style the element with them,
 * for example `scale-y-[var(--b0,0.2)]`; they stay at their fallbacks when nothing is playing.
 */
export function useLevelVars(ref: RefObject<HTMLElement | null>, bars = 0): void {
  useEffect(
    () =>
      subscribeLevels((levels) => {
        const el = ref.current;
        if (!el) return;
        const set = (name: string, value: number): void => {
          el.style.setProperty(name, value.toFixed(3));
        };
        set('--energy', levels.energy);
        set('--bass', levels.bass);
        set('--beat', levels.beat);
        for (let i = 0; i < bars; i += 1)
          set(
            `--b${String(i)}`,
            bandMean(
              levels,
              Math.floor((i * BAND_COUNT) / bars),
              Math.floor(((i + 1) * BAND_COUNT) / bars),
            ),
          );
      }),
    [ref, bars],
  );
}
