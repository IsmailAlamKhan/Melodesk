import { cn } from '@melodesk/ui';
import { useEffect, useRef } from 'react';
import { lineProgress, type LyricsRow } from './rows';
import { describeTranslateError } from './describeError';
import { useTrackLyrics } from './useTrackLyrics';
import { useT } from '../../i18n/index';
import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { usePositionMs } from '../../player/usePositionMs';
import { lyricsSources } from '../../core';
import { LyricsToolbar } from './LyricsToolbar';

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
  const t = useT();
  const title = usePlayerStore((s) => s.track?.title ?? null);
  const positionMs = usePositionMs();
  const listRef = useRef<HTMLDivElement>(null);
  const {
    videoId,
    lyrics,
    rows,
    hasTimed,
    offsetMs,
    setOffset,
    lrclibOn,
    prefs,
    romanized,
    translated,
    caveat,
    activeAt,
  } = useTrackLyrics();
  const data = lyrics.data;
  const active = activeAt(positionMs);

  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-line="${String(active)}"]`);
    if (!list || !el) return;
    // Scroll the list itself. scrollIntoView would also scroll every ancestor, and the full-screen
    // view (overflow hidden, with an oversized blurred backdrop) slid sideways with each line.
    const delta =
      el.getBoundingClientRect().top -
      list.getBoundingClientRect().top -
      (list.clientHeight - el.offsetHeight) / 2;
    list.scrollBy({
      top: delta,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [active]);

  if (!videoId) return <div className="p-4 text-sm text-fg-muted">{t('lyrics.playToSee')}</div>;
  if (lyrics.isPending)
    return <div className="p-4 text-sm text-fg-muted">{t('lyrics.loading')}</div>;
  if (lyrics.isError)
    return <div className="p-4 text-sm text-danger">{t('lyrics.loadFailed')}</div>;
  if (!data?.text && !data?.synced)
    return (
      <div className="flex flex-col gap-3 p-4 text-sm text-fg-muted">
        <div>{data?.source ?? t('lyrics.none')}</div>
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
    <div className="flex h-full min-h-0 flex-col">
      {/* The toolbar sits above the scrolling lines, never over them. */}
      <div
        className={cn(
          'z-10 flex shrink-0 items-center justify-between gap-2 px-4 py-2',
          !large && 'bg-bg-elevated',
        )}
      >
        {!large && <div className="min-w-0 truncate text-xs text-fg-subtle">{title}</div>}
        <div
          className={cn(
            large && 'ms-auto rounded-full bg-bg-overlay/60 px-2 py-0.5 backdrop-blur-md',
          )}
        >
          <LyricsToolbar
            hasTimedLines={hasTimed}
            offsetMs={offsetMs}
            onOffset={setOffset}
            caveat={prefs.romanize ? caveat : null}
          />
        </div>
      </div>
      {/* The lines fade out at the top and bottom edges instead of being cut off. */}
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 pt-8 pb-24 [mask-image:linear-gradient(to_bottom,transparent,black_2rem,black_calc(100%-4rem),transparent)]"
      >
        {!hasTimed && !lrclibOn && <TimedBanner />}
        {!hasTimed && lrclibOn && (
          <div className="mb-2 rounded-md bg-bg-overlay px-3 py-2 text-xs text-fg-muted">
            {t('lyrics.noTimed')}
          </div>
        )}
        {prefs.translate && translated.isPending && translated.fetchStatus !== 'idle' && (
          <div className="mb-2 text-xs text-fg-subtle">{t('lyrics.translating')}</div>
        )}
        {prefs.translate && translated.isError && (
          <div role="alert" className="mb-2 rounded-md bg-danger/10 px-3 py-2 text-xs text-danger">
            {describeTranslateError(translated.error, t)}
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
    </div>
  );
}

/** Offer timed lyrics from a source the user can switch on (LRCLIB; it receives the song's title, artist and length). */
export function TimedBanner() {
  const t = useT();
  const source = lyricsSources.useAll().find((s) => s.id === 'lrclib');
  if (!source) return null;
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-md bg-bg-overlay px-3 py-2 text-xs text-fg-muted">
      <span>{t('lyrics.timedBanner')}</span>
      <button
        type="button"
        onClick={() => source.activate()}
        className="h-8 self-start rounded-md bg-fg px-3 text-xs font-medium text-bg hover:opacity-90"
      >
        {t('lyrics.getTimed')}
      </button>
    </div>
  );
}
