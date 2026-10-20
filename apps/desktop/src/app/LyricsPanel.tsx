import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@melodesk/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchLyrics, fetchNext } from '../data/innertube';
import { loadOffset, saveOffset, useLyricsPrefs } from '../lyrics/prefs';
import {
  activeIndex,
  lineProgress,
  rowsFromLyrics,
  type LyricsData,
  type LyricsRow,
} from '../lyrics/rows';
import { transliterationCaveat } from '../lyrics/transliterate';
import { useRomanized, useTranslated } from '../lyrics/useExtras';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';
import { enablePlugin, isPluginEnabled, lyricsFromPlugins, usePluginHost } from '../plugins/host';
import { LyricsToolbar } from './LyricsToolbar';

/** Playback position in ms; ticks often enough to switch lines promptly. */
function usePositionMs(): number {
  const state = usePlayerStore((s) => s.state);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state?.playing) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 80);
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

/** Fills the active line left to right in step with the song, without re-rendering the list. */
function KaraokeText({
  row,
  shiftMs,
  children,
}: {
  row: LyricsRow;
  shiftMs: number;
  children: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = (): void => {
      const st = usePlayerStore.getState().state;
      if (st && ref.current) {
        const pos =
          (st.playing ? st.position + (Date.now() - st.sampledAt) / 1000 : st.position) * 1000;
        const pct = (lineProgress(row, pos, shiftMs) * 100).toFixed(1);
        ref.current.style.backgroundImage = `linear-gradient(to right, var(--color-fg) ${pct}%, var(--color-fg-muted) ${pct}%)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [row, shiftMs]);
  return (
    <span
      ref={ref}
      className="bg-clip-text text-transparent"
      style={{ WebkitBackgroundClip: 'text' }}
    >
      {children}
    </span>
  );
}

/** Lyrics for the current track: timed when available, click a line to seek, optional romanization and translation. */
export function LyricsPanel({ large = false }: { large?: boolean } = {}) {
  const videoId = usePlayerStore((s) => s.track?.videoId ?? null);
  const title = usePlayerStore((s) => s.track?.title ?? null);
  const ready = usePlayerStore((s) => s.ready);
  const positionMs = usePositionMs();
  const listRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const prefs = useLyricsPrefs();
  const lrclibOn = usePluginHost((s) =>
    s.plugins.some((p) => p.manifest.id === 'lrclib' && p.enabled),
  );

  const lyrics = useQuery<LyricsData>({
    queryKey: ['lyrics', videoId, lrclibOn],
    enabled: ready && videoId !== null,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const next = await fetchNext({ videoId: videoId ?? '' });
      const own = next.lyricsBrowseId
        ? await fetchLyrics(next.lyricsBrowseId)
        : { text: null, source: null, synced: null };
      if (own.synced) return { ...own, origin: 'youtube' as const };
      // YouTube's web lyrics are usually untimed. If LRCLIB is on, prefer its timed lyrics.
      const t = usePlayerStore.getState().track;
      const st = usePlayerStore.getState().state;
      const plugin =
        t?.videoId && isPluginEnabled('lrclib')
          ? await lyricsFromPlugins({
              videoId: t.videoId,
              title: t.title,
              artist: t.artist,
              album: t.album,
              artworkUrl: t.artworkUrl,
              durationSeconds: st?.duration ?? null,
            })
          : null;
      if (plugin?.synced)
        return {
          text: plugin.text,
          source: plugin.source,
          synced: plugin.synced,
          origin: 'plugin' as const,
        };
      if (own.text) return { ...own, origin: 'youtube' as const };
      if (plugin)
        return {
          text: plugin.text,
          source: plugin.source,
          synced: plugin.synced,
          origin: 'plugin' as const,
        };
      return { ...own, origin: 'youtube' as const };
    },
  });

  const offset = useQuery({
    queryKey: ['lyrics-offset', videoId],
    enabled: videoId !== null,
    staleTime: Infinity,
    queryFn: () => loadOffset(videoId ?? ''),
  });
  const offsetMs = offset.data ?? 0;
  const setOffset = (ms: number): void => {
    if (!videoId) return;
    qc.setQueryData(['lyrics-offset', videoId], ms);
    void saveOffset(videoId, ms);
  };

  const data = lyrics.data;
  const rows = useMemo(() => (data ? rowsFromLyrics(data) : []), [data]);
  const texts = useMemo(() => rows.map((r) => r.text), [rows]);
  const romanized = useRomanized(texts, prefs.romanize);
  const translated = useTranslated(videoId, texts, prefs.translate);
  const caveat = useMemo(() => transliterationCaveat(texts), [texts]);
  const hasTimed = !!data?.synced?.length;
  const active = hasTimed ? activeIndex(rows, positionMs, offsetMs) : -1;

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-line="${String(active)}"]`);
    el?.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [active]);

  if (!videoId)
    return <div className="p-4 text-sm text-fg-muted">Play something to see its lyrics.</div>;
  if (lyrics.isPending) return <div className="p-4 text-sm text-fg-muted">Loading lyrics…</div>;
  if (lyrics.isError) return <div className="p-4 text-sm text-danger">Couldn’t load lyrics.</div>;
  if (!data?.text && !data?.synced)
    return (
      <div className="flex flex-col gap-3 p-4 text-sm text-fg-muted">
        <div>{data?.source ?? 'No lyrics available for this song.'}</div>
        {!lrclibOn && <TimedBanner />}
      </div>
    );

  const showRoman = prefs.romanize && romanized.data;
  const showTrans = prefs.translate && translated.data;
  const sizeOriginal = large
    ? 'font-display text-3xl leading-tight font-bold'
    : 'font-display text-xl leading-snug font-semibold';
  const sizeExtra = large ? 'text-lg' : 'text-sm';

  return (
    <div ref={listRef} className="flex h-full flex-col overflow-y-auto px-4 pb-24">
      <div
        className={cn(
          'sticky top-0 z-10 flex items-center justify-between gap-2 py-2',
          large ? 'bg-transparent' : 'bg-bg-elevated',
        )}
      >
        {!large && <div className="min-w-0 truncate text-xs text-fg-subtle">{title}</div>}
        <div className={cn(large && 'ml-auto')}>
          <LyricsToolbar
            hasTimedLines={hasTimed}
            offsetMs={offsetMs}
            onOffset={setOffset}
            caveat={prefs.romanize ? caveat : null}
          />
        </div>
      </div>
      {!hasTimed && !lrclibOn && <TimedBanner />}
      {!hasTimed && lrclibOn && (
        <div className="mb-2 rounded-md bg-bg-overlay px-3 py-2 text-xs text-fg-muted">
          No timed lyrics found for this song, so lines can’t follow the music.
        </div>
      )}
      {prefs.translate && translated.isPending && translated.fetchStatus !== 'idle' && (
        <div className="mb-2 text-xs text-fg-subtle">Translating…</div>
      )}
      {prefs.translate && translated.isError && (
        <div role="alert" className="mb-2 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
          {translated.error.message}
        </div>
      )}
      <ol className="flex flex-col gap-1 py-4">
        {rows.map((row, i) => {
          const roman = showRoman ? romanized.data[i] : undefined;
          const trans = showTrans ? translated.data[i] : undefined;
          if (!row.text.trim()) return <li key={i} aria-hidden className="h-4" />;
          const timed = row.startMs !== undefined;
          const content = (
            <>
              <span className={sizeOriginal}>
                {timed && i === active ? (
                  <KaraokeText row={row} shiftMs={offsetMs}>
                    {row.text}
                  </KaraokeText>
                ) : (
                  row.text
                )}
              </span>
              {roman && roman !== row.text && (
                <span className={cn('block font-normal italic text-fg-subtle', sizeExtra)}>
                  {roman}
                </span>
              )}
              {trans && trans !== row.text && (
                <span className={cn('block font-normal text-fg-muted', sizeExtra)}>{trans}</span>
              )}
            </>
          );
          return (
            <li key={`${String(row.startMs ?? '')}-${String(i)}`} data-line={i}>
              {timed ? (
                <button
                  type="button"
                  dir="auto"
                  onClick={() =>
                    void sendCommand({
                      type: 'seek',
                      seconds: Math.max(0, ((row.startMs ?? 0) + offsetMs) / 1000),
                    })
                  }
                  className={cn(
                    'w-full rounded-md px-2 py-1.5 text-start transition-colors duration-(--duration-slow) ease-(--ease-out) hover:bg-bg-overlay/60',
                    i === active ? 'text-fg' : i < active ? 'text-fg-subtle' : 'text-fg-muted',
                  )}
                >
                  {content}
                </button>
              ) : (
                <p dir="auto" className="px-2 py-1 text-fg">
                  {content}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {data.source && <div className="pt-2 text-xs text-fg-subtle">{data.source}</div>}
    </div>
  );
}

/** Offer timed lyrics from LRCLIB (opt-in: it receives the title, artist and length). */
function TimedBanner() {
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-md bg-bg-overlay px-3 py-2 text-xs text-fg-muted">
      <span>
        These lyrics aren’t timed. LRCLIB can provide lyrics that follow the music; it receives the
        song title, artist and length.
      </span>
      <button
        type="button"
        onClick={() => void enablePlugin('lrclib')}
        className="h-8 self-start rounded-md bg-fg px-3 text-xs font-medium text-bg hover:opacity-90"
      >
        Get timed lyrics from LRCLIB
      </button>
    </div>
  );
}
