import { useEffect } from 'react';
import { create } from 'zustand';
import { lyricsSources } from '../../core';
import { kvGet, kvSet } from '../../data/kv';
import { usePlayerStore } from '../../player/store';
import { hashLines } from './rows';

export type Explanation =
  | { state: 'loading' }
  | { state: 'done'; text: string }
  | { state: 'error'; reason: 'off' | 'failed' };

/** Explanations by song, then by line (hash of its text). Kept outside the view, so asking carries on when it closes. */
interface Store {
  bySong: Record<string, Record<string, Explanation>>;
}

const useExplanationStore = create<Store>(() => ({ bySong: {} }));
const loaded = new Set<string>();

const kvKey = (videoId: string): string => `lyrics:explain:${videoId}`;
export const lineKey = (line: string): string => hashLines([line]);

function put(videoId: string, key: string, value: Explanation): void {
  useExplanationStore.setState((s) => ({
    bySong: { ...s.bySong, [videoId]: { ...s.bySong[videoId], [key]: value } },
  }));
}

/** The answers that are kept on this computer for a song, once. */
async function loadSaved(videoId: string): Promise<void> {
  if (loaded.has(videoId)) return;
  loaded.add(videoId);
  try {
    const raw = await kvGet(kvKey(videoId));
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, string>;
    useExplanationStore.setState((s) => {
      const mine = { ...s.bySong[videoId] };
      for (const [key, text] of Object.entries(saved)) mine[key] ??= { state: 'done', text };
      return { bySong: { ...s.bySong, [videoId]: mine } };
    });
  } catch {
    /* unreadable: they are simply asked for again */
  }
}

async function save(videoId: string): Promise<void> {
  const mine = useExplanationStore.getState().bySong[videoId] ?? {};
  const done: Record<string, string> = {};
  for (const [key, value] of Object.entries(mine))
    if (value.state === 'done') done[key] = value.text;
  try {
    await kvSet(kvKey(videoId), JSON.stringify(done));
  } catch {
    /* it still shows; it just is not kept */
  }
}

/** Ask for an explanation of `texts[index]`. Does nothing when one is already being made or is there. */
export function explainLine(videoId: string, texts: readonly string[], index: number): void {
  const line = texts[index];
  if (!line) return;
  const key = lineKey(line);
  const current = useExplanationStore.getState().bySong[videoId]?.[key];
  if (current?.state === 'loading' || current?.state === 'done') return;

  const source = lyricsSources.all().find((s) => s.canExplain?.() && s.explain);
  const track = usePlayerStore.getState().track;
  if (!source?.explain) {
    put(videoId, key, { state: 'error', reason: 'off' });
    return;
  }
  if (!track?.videoId || track.videoId !== videoId) return;
  const duration = usePlayerStore.getState().state?.duration ?? null;
  const context = texts
    .slice(Math.max(0, index - 2), index + 3)
    .filter((x, j) => x.trim() && j !== Math.min(index, 2));

  put(videoId, key, { state: 'loading' });
  source
    .explain({ ...track, videoId: track.videoId, durationSeconds: duration }, line, context)
    .then((text) => {
      put(videoId, key, text ? { state: 'done', text } : { state: 'error', reason: 'failed' });
      if (text) void save(videoId);
    })
    .catch(() => {
      put(videoId, key, { state: 'error', reason: 'failed' });
    });
}

/** The explanations of a song's lines, and a way to ask for one. */
export function useExplanations(videoId: string | null, texts: readonly string[]) {
  const mine = useExplanationStore((s) => (videoId ? s.bySong[videoId] : undefined));
  useEffect(() => {
    if (videoId) void loadSaved(videoId);
  }, [videoId]);
  return {
    get: (i: number): Explanation | undefined => {
      const line = texts[i];
      return line ? mine?.[lineKey(line)] : undefined;
    },
    explain: (i: number): void => {
      if (videoId) explainLine(videoId, texts, i);
    },
  };
}
