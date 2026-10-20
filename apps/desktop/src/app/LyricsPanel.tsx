import { useQuery } from '@tanstack/react-query';
import { cn } from '@melodesk/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchLyrics, fetchNext } from '../data/innertube';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';

/** Smoothly interpolated playback position in ms, for highlighting the current lyric line. */
function usePositionMs(): number {
  const state = usePlayerStore((s) => s.state);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state?.playing) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 100);
    return () => {
      window.clearInterval(id);
    };
  }, [state?.playing]);
  if (!state) return 0;
  return (
    (state.playing ? state.position + Math.max(0, now - state.sampledAt) / 1000 : state.position) *
    1000
  );
}

/** Lyrics for the current track, synced when YouTube provides timed lines; click a line to seek. */
export function LyricsPanel() {
  const videoId = usePlayerStore((s) => s.track?.videoId ?? null);
  const title = usePlayerStore((s) => s.track?.title ?? null);
  const ready = usePlayerStore((s) => s.ready);
  const positionMs = usePositionMs();
  const listRef = useRef<HTMLDivElement>(null);

  const lyrics = useQuery({
    queryKey: ['lyrics', videoId],
    enabled: ready && videoId !== null,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const next = await fetchNext({ videoId: videoId ?? '' });
      if (!next.lyricsBrowseId) return { text: null, source: null, synced: null };
      return fetchLyrics(next.lyricsBrowseId);
    },
  });

  const synced = lyrics.data?.synced ?? null;
  const activeIndex = useMemo(() => {
    if (!synced) return -1;
    let idx = -1;
    for (let i = 0; i < synced.length; i += 1) {
      const line = synced[i];
      if (line && line.startMs <= positionMs) idx = i;
      else break;
    }
    return idx;
  }, [synced, positionMs]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${String(activeIndex)}"]`);
    el?.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [activeIndex]);

  if (!videoId)
    return <div className="p-4 text-sm text-fg-muted">Play something to see its lyrics.</div>;
  if (lyrics.isPending) return <div className="p-4 text-sm text-fg-muted">Loading lyrics…</div>;
  if (lyrics.isError) return <div className="p-4 text-sm text-danger">Couldn’t load lyrics.</div>;
  const data = lyrics.data;
  if (!data.text && !data.synced)
    return (
      <div className="p-4 text-sm text-fg-muted">
        {data.source ?? 'No lyrics available for this song.'}
      </div>
    );

  return (
    <div ref={listRef} className="flex h-full flex-col overflow-y-auto px-4 pb-24">
      <div className="sticky top-0 bg-bg-elevated py-3 text-xs text-fg-subtle">{title}</div>
      {synced ? (
        <ol className="flex flex-col gap-1 py-6">
          {synced.map((line, i) => (
            <li key={`${String(line.startMs)}-${String(i)}`} data-line={i}>
              <button
                type="button"
                onClick={() => void sendCommand({ type: 'seek', seconds: line.startMs / 1000 })}
                className={cn(
                  'w-full rounded-md px-2 py-1.5 text-left font-display text-xl leading-snug font-semibold transition-all duration-(--duration-slow) ease-(--ease-out) hover:bg-bg-overlay',
                  i === activeIndex
                    ? 'scale-100 text-fg'
                    : i < activeIndex
                      ? 'text-fg-subtle'
                      : 'text-fg-muted',
                )}
              >
                {line.text || '♪'}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-6 text-base leading-relaxed whitespace-pre-line text-fg">{data.text}</p>
      )}
      {data.source && <div className="pt-4 text-xs text-fg-subtle">{data.source}</div>}
    </div>
  );
}
