import { IconButton, Slider, Tooltip, cn } from '@melodesk/ui';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AArrowDown,
  AArrowUp,
  ChevronDown,
  Minus,
  Pause,
  Play,
  Plus,
  Search,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toHex } from '../../appearance/color';
import { useArtworkColor } from '../../appearance/artworkAccent';
import { useT } from '../../i18n/index';
import { describeTranslateError } from '../lyrics/describeError';
import { interlude, wordFills, wordTimings } from './karaoke';
import { useLyricsPrefs } from '../lyrics/prefs';
import type { LyricsRow } from '../lyrics/rows';
import { useTrackLyrics } from '../lyrics/useTrackLyrics';
import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { usePositionMs } from '../../player/usePositionMs';
import { TimedBanner } from '../lyrics/LyricsPanel';
import { LyricsToolbar } from '../lyrics/LyricsToolbar';
import { useKaraoke } from './store';
import { Img, runAction } from '../../core';

type Size = 'm' | 'l' | 'xl';
const SIZES: Size[] = ['m', 'l', 'xl'];
const SIZE_CLASS: Record<Size, string> = {
  m: 'text-3xl md:text-4xl',
  l: 'text-4xl md:text-5xl',
  xl: 'text-5xl md:text-7xl',
};
const NUDGE_MS = 100;
const SEEK_STEP_S = 5;
const RTL_SCRIPT = /[֐-ࣿ]/u;

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

/** The line being sung: each word fills in turn, timed by spreading the line over its words. */
function SingingLine({
  row,
  nextStartMs,
  shiftMs,
  className,
}: {
  row: LyricsRow;
  nextStartMs: number | undefined;
  shiftMs: number;
  className?: string;
}) {
  const words = useMemo(() => wordTimings(row, nextStartMs), [row, nextStartMs]);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const rtl = RTL_SCRIPT.test(row.text);
  // Scripts written without spaces (Chinese, Japanese) are split per character; do not re-space them.
  const joiner = words.length > 1 && !/\s/u.test(row.text.trim()) ? '' : ' ';

  useEffect(() => {
    let raf = 0;
    const dir = rtl ? 'to left' : 'to right';
    const tick = (): void => {
      const st = usePlayerStore.getState().state;
      if (st) {
        const pos =
          (st.playing ? st.position + (Date.now() - st.sampledAt) / 1000 : st.position) * 1000;
        const fills = wordFills(words, pos, shiftMs);
        fills.forEach((f, i) => {
          const el = refs.current[i];
          if (!el) return;
          const pct = (f * 100).toFixed(1);
          el.style.backgroundImage = `linear-gradient(${dir}, var(--color-fg) ${pct}%, var(--color-fg-subtle) ${pct}%)`;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [words, shiftMs, rtl]);

  return (
    <p dir="auto" className={cn('font-display font-bold leading-tight', className)}>
      {words.map((w, i) => (
        <span key={`${String(i)}-${w.text}`}>
          <span
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="bg-clip-text text-transparent"
            style={{ WebkitBackgroundClip: 'text', backgroundImage: 'none' }}
          >
            {w.text}
          </span>
          {i < words.length - 1 ? joiner : ''}
        </span>
      ))}
    </p>
  );
}

/** Three dots that drop away one by one before the next line, so singers know when to come in. */
function Countdown({ progress, label }: { progress: number; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="flex items-center gap-4"
      style={{ opacity: 0.35 + 0.65 * (1 - progress) }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-5 rounded-full bg-[var(--np-accent)] transition-all duration-500"
          style={{
            transform: progress < (3 - i) / 3 ? 'scale(1)' : 'scale(0.25)',
            opacity: progress < (3 - i) / 3 ? 1 : 0.3,
          }}
        />
      ))}
      <span className="ms-2 text-lg text-fg-muted">{label}</span>
    </div>
  );
}

function Stage() {
  const t = useT();
  const navigate = useNavigate();
  const close = useKaraoke((s) => s.setOpen);
  const track = usePlayerStore((s) => s.track);
  const state = usePlayerStore((s) => s.state);
  const positionMs = usePositionMs(100);
  const artRgb = useArtworkColor(track?.artworkUrl ?? null);
  const accent = artRgb ? toHex(artRgb) : null;
  const size = useLyricsPrefs((s) => s.karaokeSize);
  const updatePrefs = useLyricsPrefs((s) => s.update);
  const [scrub, setScrub] = useState<number | null>(null);
  const {
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
  } = useTrackLyrics();
  const data = lyrics.data;

  const playing = state?.playing ?? false;
  const duration = state?.duration ?? 0;
  const positionS = positionMs / 1000;

  const nudge = (delta: number): void => {
    setOffset(Math.max(-10_000, Math.min(10_000, offsetMs + delta)));
  };

  // Keys are handled in the capture phase so Now Playing underneath does not also react. The
  // handler is kept in a ref so the listener is registered once, not on every position tick.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    keyHandler.current = (e: KeyboardEvent): void => {
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        close(false);
      } else if (typing) {
        return;
      } else if (e.key === ' ') {
        e.preventDefault();
        e.stopImmediatePropagation();
        void sendCommand({ type: 'toggle' });
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const dir = e.key === 'ArrowLeft' ? -1 : 1;
        void sendCommand({
          type: 'seek',
          seconds: Math.max(0, positionS + dir * SEEK_STEP_S),
        });
      } else if (e.key === '[') nudge(-NUDGE_MS);
      else if (e.key === ']') nudge(NUDGE_MS);
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      keyHandler.current(e);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const lines = useMemo(
    () => rows.map((r, i) => ({ r, i })).filter(({ r }) => r.text.trim() !== ''),
    [rows],
  );
  const gap = hasTimed ? interlude(rows, positionMs, offsetMs) : null;
  // Position within `lines` of the line being sung (or of the last one sung, during a break).
  let cur = -1;
  if (hasTimed) {
    for (let k = 0; k < lines.length; k += 1) {
      const start = lines[k]?.r.startMs;
      if (start !== undefined && start + offsetMs <= positionMs) cur = k;
      else break;
    }
  }
  // During a break the countdown takes the "current" slot and the next line is shown below it.
  const firstUpcoming = gap ? lines.findIndex((l) => l.i === gap.nextIndex) : cur + 1;
  const above = gap ? cur : cur - 1;
  const shown = lines.slice(Math.max(0, firstUpcoming), Math.max(0, firstUpcoming) + 3);
  const sizeClass = SIZE_CLASS[size];
  const curLine = cur >= 0 ? lines[cur] : undefined;
  const prevLine = above >= 0 ? lines[above] : undefined;
  const extra = (i: number): { roman: string | undefined; trans: string | undefined } => ({
    roman: prefs.romanize ? romanized.data?.[i] : undefined,
    trans: prefs.translate ? translated.data?.[i] : undefined,
  });
  const renderExtras = (i: number, text: string, big: boolean): React.ReactNode => {
    const { roman, trans } = extra(i);
    return (
      <>
        {roman && roman !== text && (
          <span className={cn('block italic text-fg-subtle', big ? 'text-2xl' : 'text-lg')}>
            {roman}
          </span>
        )}
        {trans && trans !== text && (
          <span className={cn('block text-fg-muted', big ? 'text-2xl' : 'text-lg')}>{trans}</span>
        )}
      </>
    );
  };

  const findVersion = (): void => {
    const q = [track?.title, track?.artist, 'karaoke'].filter(Boolean).join(' ');
    close(false);
    runAction('nowPlaying.close');
    void navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const sizeIdx = SIZES.indexOf(size);
  const body = (() => {
    if (!track) return <p className="text-xl text-fg-muted">{t('player.nothingPlaying')}</p>;
    if (lyrics.isPending) return <p className="text-xl text-fg-muted">{t('lyrics.loading')}</p>;
    if (lyrics.isError) return <p className="text-xl text-danger">{t('lyrics.loadFailed')}</p>;
    if (!data?.text && !data?.synced)
      return (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-xl text-fg-muted">{data?.source ?? t('lyrics.none')}</p>
          {!lrclibOn && <TimedBanner />}
        </div>
      );
    if (!hasTimed)
      return (
        <div className="flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto py-6">
          <p className="rounded-md bg-bg-overlay/70 px-4 py-3 text-sm text-fg-muted">
            {t('karaoke.untimed')}
          </p>
          {!lrclibOn && <TimedBanner />}
          {rows.map((r, i) =>
            r.text.trim() ? (
              <p key={i} dir="auto" className={cn('font-display font-semibold', 'text-2xl')}>
                {r.text}
              </p>
            ) : (
              <span key={i} aria-hidden className="h-4" />
            ),
          )}
        </div>
      );
    return (
      <div className="flex w-full max-w-5xl flex-col items-center gap-8 text-center">
        {prevLine && (
          <motion.p
            key={`prev-${String(prevLine.i)}`}
            dir="auto"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 0.35, y: 0 }}
            className="font-display text-2xl font-semibold text-fg-muted"
          >
            {prevLine.r.text}
          </motion.p>
        )}
        {gap ? (
          <Countdown progress={gap.progress} label={t('karaoke.interlude')} />
        ) : (
          curLine && (
            <motion.div
              key={`cur-${String(curLine.i)}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-2"
            >
              <SingingLine
                row={curLine.r}
                nextStartMs={lines[cur + 1]?.r.startMs}
                shiftMs={offsetMs}
                className={sizeClass}
              />
              {renderExtras(curLine.i, curLine.r.text, true)}
            </motion.div>
          )
        )}
        <div className="flex flex-col gap-5">
          {shown.map(({ r, i }, k) => (
            <motion.div
              key={`next-${String(i)}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: k === 0 ? 0.75 : 0.4, y: 0 }}
              className="flex flex-col gap-1"
            >
              {gap && k === 0 && (
                <span className="text-sm tracking-wide text-fg-subtle uppercase">
                  {t('karaoke.upNext')}
                </span>
              )}
              <p
                dir="auto"
                className={cn(
                  'font-display font-semibold',
                  k === 0 ? 'text-3xl md:text-4xl' : 'text-2xl',
                )}
              >
                {r.text}
              </p>
              {renderExtras(i, r.text, false)}
            </motion.div>
          ))}
        </div>
        {prefs.translate && translated.isError && (
          <p role="alert" className="text-sm text-danger">
            {describeTranslateError(translated.error, t)}
          </p>
        )}
      </div>
    );
  })();

  return (
    <motion.section
      aria-label={t('karaoke.region')}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-bg text-fg"
      style={{ ['--np-accent' as string]: accent ?? 'var(--color-accent)' }}
    >
      {track?.artworkUrl && (
        <Img
          src={track.artworkUrl}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-40 blur-3xl"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--np-accent)_30%,transparent),transparent_65%),linear-gradient(to_bottom,transparent,var(--color-bg)_110%)]" />

      <header
        data-tauri-drag-region
        className="relative flex h-16 shrink-0 items-center justify-between gap-4 px-6 pt-2"
      >
        <div className="min-w-0">
          <div className="truncate font-display text-lg font-semibold">{track?.title ?? ''}</div>
          <div className="truncate text-sm text-fg-muted">{track?.artist ?? ''}</div>
        </div>
        <div className="flex items-center gap-1">
          <LyricsToolbar
            hasTimedLines={hasTimed}
            offsetMs={offsetMs}
            onOffset={setOffset}
            caveat={prefs.romanize ? caveat : null}
          />
          <IconButton
            label={t('karaoke.smaller')}
            size="sm"
            disabled={sizeIdx <= 0}
            onClick={() => updatePrefs({ karaokeSize: SIZES[Math.max(0, sizeIdx - 1)] ?? 'l' })}
          >
            <AArrowDown />
          </IconButton>
          <IconButton
            label={t('karaoke.larger')}
            size="sm"
            disabled={sizeIdx >= SIZES.length - 1}
            onClick={() =>
              updatePrefs({ karaokeSize: SIZES[Math.min(SIZES.length - 1, sizeIdx + 1)] ?? 'l' })
            }
          >
            <AArrowUp />
          </IconButton>
          <IconButton label={t('karaoke.findVersion')} size="sm" onClick={findVersion}>
            <Search />
          </IconButton>
          <IconButton label={t('karaoke.close')} onClick={() => close(false)}>
            <ChevronDown />
          </IconButton>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center px-8">{body}</main>

      <footer className="relative flex shrink-0 flex-col items-center gap-3 px-8 pt-2 pb-6">
        <div
          dir="ltr"
          className="flex w-full max-w-3xl items-center gap-3 text-xs tabular-nums text-fg-subtle"
        >
          <span className="w-10 text-right">{fmt(scrub ?? positionS)}</span>
          <Slider
            label={t('player.seek')}
            valueLabel={fmt}
            value={scrub ?? positionS}
            max={duration}
            step={0.5}
            disabled={!duration}
            onChange={setScrub}
            onCommit={(v) => {
              setScrub(null);
              void sendCommand({ type: 'seek', seconds: v });
            }}
          />
          <span className="w-10">{fmt(duration)}</span>
        </div>
        <div dir="ltr" className="flex items-center gap-4">
          {hasTimed && (
            <IconButton
              label={t('karaoke.nudgeEarlier')}
              size="sm"
              onClick={() => nudge(-NUDGE_MS)}
            >
              <Minus />
            </IconButton>
          )}
          <IconButton
            label={t('player.previous')}
            size="lg"
            onClick={() => void sendCommand({ type: 'previous' })}
          >
            <SkipBack />
          </IconButton>
          <Tooltip label={playing ? t('player.pause') : t('player.play')}>
            <button
              type="button"
              aria-label={playing ? t('player.pause') : t('player.play')}
              onClick={() => void sendCommand({ type: 'toggle' })}
              className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {playing ? <Pause className="size-6" /> : <Play className="size-6 translate-x-0.5" />}
            </button>
          </Tooltip>
          <IconButton
            label={t('player.next')}
            size="lg"
            onClick={() => void sendCommand({ type: 'next' })}
          >
            <SkipForward />
          </IconButton>
          {hasTimed && (
            <IconButton label={t('karaoke.nudgeLater')} size="sm" onClick={() => nudge(NUDGE_MS)}>
              <Plus />
            </IconButton>
          )}
        </div>
        <p className="text-xs text-fg-subtle">{t('karaoke.shortcuts')}</p>
      </footer>
    </motion.section>
  );
}

/**
 * Karaoke mode: huge sing-along lyrics over the artwork, words filling in time with the music,
 * a countdown through instrumental breaks, and timing/size controls. Needs timed lyrics to follow
 * the song; without them it shows the plain lyrics and says so.
 */
export function KaraokeView() {
  const open = useKaraoke((s) => s.open);
  return <AnimatePresence>{open && <Stage key="karaoke" />}</AnimatePresence>;
}
