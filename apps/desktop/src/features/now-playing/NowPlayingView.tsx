import { IconButton, Slider, Tooltip, cn } from '@melodesk/ui';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  Heart,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { createElement, useEffect, useRef, useState } from 'react';
import { toHex } from '../../appearance/color';
import { useArtworkColor } from '../../appearance/artworkAccent';
import { useT } from '../../i18n/index';
import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { useVolume } from '../../player/useVolume';
import { ArtistLinks } from '../../app/components/ArtistLinks';
import { BeatRing } from '../../app/components/BeatRing';
import { Marquee } from '../../app/components/Marquee';
import { setLikeStatus } from '../../player/like';
import { isLocalId } from '../../player/sourceIds';
import { useNowPlaying } from './store';
import { FeatureBoundary, Img, Slot, useLevelVars, useSlot } from '../../core';

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${String(h)}:${String(m).padStart(2, '0')}:${sec}` : `${String(m)}:${sec}`;
}

function usePosition(): number {
  const state = usePlayerStore((s) => s.state);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state?.playing) return;
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [state?.playing]);
  if (!state) return 0;
  return state.playing
    ? Math.min(
        state.duration || Infinity,
        state.position + Math.max(0, now - state.sampledAt) / 1000,
      )
    : state.position;
}

const TAB_KEY = 'melodesk.nowPlayingTab';

function readTab(): string | null {
  try {
    return localStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
}

/** Pill-shaped tabs with a highlight that slides to the chosen one. */
function Tabs({
  tabs,
  active,
  onChange,
  name,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  name: string;
}) {
  return (
    <div role="tablist" className="flex gap-1 rounded-full bg-bg-overlay/60 p-1 backdrop-blur-md">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative h-9 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent',
            active === tab.id ? 'text-accent-fg' : 'text-fg-muted hover:text-fg',
          )}
        >
          {active === tab.id && (
            <motion.span
              layoutId={`np-tab-${name}`}
              className="absolute inset-0 rounded-full bg-accent"
              transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            />
          )}
          <span className="relative">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The backdrop breathes: a wash of the cover's colour that brightens with the loudness. */
function BackdropPulse() {
  const ref = useRef<HTMLDivElement>(null);
  useLevelVars(ref);
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_60%,color-mix(in_oklch,var(--np-accent)_45%,transparent),transparent_55%)] opacity-[calc(0.1+var(--energy,0)*0.7)] will-change-[opacity]"
    />
  );
}

/** The blurred copy of the cover behind it: it swells with the bass and brightens with the music. */
function AmbientGlow({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLevelVars(ref);
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-[calc(0.45+var(--energy,0.3)*0.5)] will-change-[transform,opacity] [transform:translateY(0.75rem)_scale(calc(0.93+var(--bass,0)*0.12))]"
    >
      <Img src={src} alt="" className="size-full rounded-3xl object-cover blur-2xl saturate-150" />
    </div>
  );
}

/**
 * Full-screen Now Playing. Left: the artwork (it settles back a little when paused), title, artist,
 * seek bar and controls. Right: a glass panel with tabs for whatever features offer there (the
 * queue, the lyrics). On a narrow window the player and those tabs take turns. The backdrop is the
 * blurred artwork with a glow in its colour. Escape or the chevron closes it.
 */
export function NowPlayingView() {
  const t = useT();
  const open = useNowPlaying((s) => s.open);
  const close = useNowPlaying((s) => s.setOpen);
  const track = usePlayerStore((s) => s.track);
  const state = usePlayerStore((s) => s.state);
  const queue = usePlayerStore((s) => s.queue);
  const flags = usePlayerStore((s) => s.flags);
  const position = usePosition();
  const [scrub, setScrub] = useState<number | null>(null);
  const artRgb = useArtworkColor(track?.artworkUrl ?? null);
  const accent = artRgb ? toHex(artRgb) : null;
  const tabs = useSlot('nowPlaying.side');
  // `side` is the tab shown in the panel; `view` only matters on a narrow window, where the player
  // and the panel are separate screens.
  const [side, setSide] = useState<string | null>(readTab);
  const [view, setView] = useState<'player' | 'side'>('player');
  const activeSide = tabs.find((x) => x.id === side) ?? tabs[0];
  const choose = (id: string): void => {
    setSide(id);
    setView('side');
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      /* the choice just is not remembered */
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close(false);
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        void sendCommand({ type: 'toggle' });
      }
    };
    // On the document, which hears a key before the window does, so the app-wide keys (Space…) see
    // that this already handled the press. Karaoke's capture-phase handler still comes first.
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const playing = state?.playing ?? false;
  const duration = state?.duration ?? 0;
  const volume = state?.volume ?? 1;
  const muted = state?.muted ?? false;
  const volumeProps = useVolume();
  const liked = flags?.likeStatus === 'LIKE';
  const tabItems = tabs.map((x) => ({ id: x.id, label: x.label ? t(x.label) : x.id }));
  const showPlayer = view === 'player' || !activeSide;
  return (
    <AnimatePresence>
      {open && (
        <motion.section
          aria-label={t('nowPlaying.region')}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-30 overflow-clip bg-bg text-fg"
          style={{ ['--np-accent' as string]: accent ?? 'var(--color-accent)' }}
        >
          {track?.artworkUrl && (
            <Img
              src={track.artworkUrl}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-50 blur-3xl"
            />
          )}
          <BackdropPulse />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklch,var(--np-accent)_40%,transparent),transparent_60%),radial-gradient(ellipse_at_bottom_right,color-mix(in_oklch,var(--np-accent)_25%,transparent),transparent_55%),linear-gradient(to_bottom,transparent,var(--color-bg)_130%)]" />
          <div
            data-tauri-drag-region
            className="absolute inset-x-0 top-0 z-10 flex h-14 items-center justify-end gap-1 px-3 pt-2"
          >
            <Slot name="nowPlaying.header" />
            <IconButton label={t('nowPlaying.close')} onClick={() => close(false)}>
              <ChevronDown />
            </IconButton>
          </div>
          <div className="relative mx-auto flex h-full max-w-[96rem] flex-col gap-4 px-5 pt-16 pb-6 md:px-10 md:pb-10 md:grid md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] md:gap-8 md:pt-20 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-14">
            {tabs.length > 0 && (
              <div className="flex justify-center md:hidden">
                <Tabs
                  name="narrow"
                  tabs={[{ id: 'player', label: t('nowPlaying.region') }, ...tabItems]}
                  active={view === 'player' ? 'player' : (activeSide?.id ?? 'player')}
                  onChange={(id) => (id === 'player' ? setView('player') : choose(id))}
                />
              </div>
            )}
            <div
              className={cn(
                'min-h-0 flex-1 flex-col gap-5 md:flex',
                showPlayer ? 'flex' : 'hidden',
              )}
            >
              {queue?.title && (
                <div className="w-full shrink-0 text-center text-xs font-medium tracking-widest text-fg-subtle uppercase md:text-start">
                  {t('nowPlaying.playingFrom')}
                  <span className="mt-0.5 block truncate text-sm tracking-normal text-fg normal-case">
                    {queue.title}
                  </span>
                </div>
              )}
              {/* The artwork takes all the height the controls leave and stays square. */}
              <div className="flex min-h-32 flex-1 items-center justify-center [container-type:size]">
                <motion.div
                  key={track?.videoId ?? 'none'}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: playing ? 1 : 0.9 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="relative aspect-square w-[min(100cqw,100cqh)]"
                >
                  {/* Ambient light: a blurred copy of the cover behind it, not a box shadow, so it
                      has no hard edge and nothing clips it. */}
                  {track?.artworkUrl && <AmbientGlow src={track.artworkUrl} />}
                  <div className="relative size-full overflow-hidden rounded-3xl bg-bg-overlay shadow-xl ring-1 ring-white/10">
                    {track?.artworkUrl && (
                      <Img src={track.artworkUrl} alt="" className="size-full object-cover" />
                    )}
                  </div>
                </motion.div>
              </div>
              <div className="w-full shrink-0">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h1 className="font-display text-3xl font-bold tracking-tight">
                      <Marquee label={track?.title ?? t('player.nothingPlaying')}>
                        {track?.title ?? t('player.nothingPlaying')}
                      </Marquee>
                    </h1>
                    <ArtistLinks
                      byline={track?.artist ?? ''}
                      className="block truncate text-lg text-fg-muted"
                      onNavigate={() => close(false)}
                    />
                  </div>
                  {track?.videoId && !isLocalId(track.videoId) && (
                    <IconButton
                      label={liked ? t('player.removeLike') : t('player.like')}
                      aria-pressed={liked}
                      onClick={() => void setLikeStatus(liked ? 'INDIFFERENT' : 'LIKE')}
                    >
                      <Heart className={cn(liked && 'fill-current text-[var(--np-accent)]')} />
                    </IconButton>
                  )}
                </div>
                <div
                  dir="ltr"
                  className="mt-5 flex items-center gap-3 text-xs tabular-nums text-fg-subtle"
                >
                  <span className="w-12 text-right">{fmt(scrub ?? position)}</span>
                  <Slider
                    label={t('player.seek')}
                    valueLabel={fmt}
                    value={scrub ?? position}
                    max={duration}
                    step={0.5}
                    disabled={!duration}
                    onChange={setScrub}
                    onCommit={(v) => {
                      setScrub(null);
                      void sendCommand({ type: 'seek', seconds: v });
                    }}
                  />
                  <span className="w-12">{fmt(duration)}</span>
                </div>
                <div dir="ltr" className="mt-3 flex items-center justify-center gap-3">
                  <IconButton
                    label={t('player.shuffle')}
                    aria-pressed={queue?.shuffle ?? false}
                    className={cn(queue?.shuffle && 'text-[var(--np-accent)]')}
                    onClick={() =>
                      void sendCommand({ type: 'setShuffle', enabled: !(queue?.shuffle ?? false) })
                    }
                  >
                    <Shuffle />
                  </IconButton>
                  <IconButton
                    label={t('player.previous')}
                    size="lg"
                    onClick={() => void sendCommand({ type: 'previous' })}
                  >
                    <SkipBack />
                  </IconButton>
                  <span className="relative">
                    <BeatRing />
                    <Tooltip label={playing ? t('player.pause') : t('player.play')}>
                      <button
                        type="button"
                        aria-label={playing ? t('player.pause') : t('player.play')}
                        onClick={() => void sendCommand({ type: 'toggle' })}
                        className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-[0_10px_30px_-8px_var(--np-accent)] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        {playing ? (
                          <Pause className="size-7" />
                        ) : (
                          <Play className="size-7 translate-x-0.5" />
                        )}
                      </button>
                    </Tooltip>
                  </span>
                  <IconButton
                    label={t('player.next')}
                    size="lg"
                    onClick={() => void sendCommand({ type: 'next' })}
                  >
                    <SkipForward />
                  </IconButton>
                  <IconButton
                    label={t('player.repeat')}
                    aria-pressed={(queue?.repeat ?? 'off') !== 'off'}
                    className={cn(
                      queue?.repeat && queue.repeat !== 'off' && 'text-[var(--np-accent)]',
                    )}
                    onClick={() =>
                      void sendCommand({
                        type: 'setRepeat',
                        mode:
                          !queue || queue.repeat === 'off'
                            ? 'all'
                            : queue.repeat === 'all'
                              ? 'one'
                              : 'off',
                      })
                    }
                  >
                    {queue?.repeat === 'one' ? <Repeat1 /> : <Repeat />}
                  </IconButton>
                </div>
                <div dir="ltr" className="mt-3 flex items-center justify-center gap-2">
                  <IconButton
                    label={muted ? t('player.unmute') : t('player.mute')}
                    size="sm"
                    onClick={() => void sendCommand({ type: 'setMuted', muted: !muted })}
                  >
                    {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
                  </IconButton>
                  <Slider
                    label={t('player.volume')}
                    valueLabel={(v) => `${String(Math.round(v * 100))}%`}
                    className="w-40"
                    {...volumeProps}
                    max={1}
                    step={0.01}
                  />
                </div>
              </div>
            </div>
            {activeSide && (
              <div
                className={cn(
                  'min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border/40 bg-bg-elevated/55 shadow-2xl backdrop-blur-2xl md:flex',
                  showPlayer ? 'hidden' : 'flex',
                )}
              >
                <div className="hidden shrink-0 justify-center px-4 pt-4 md:flex">
                  <Tabs name="wide" tabs={tabItems} active={activeSide.id} onChange={choose} />
                </div>
                <div className="min-h-0 flex-1 pt-2">
                  <FeatureBoundary featureId={activeSide.featureId}>
                    {createElement(activeSide.component)}
                  </FeatureBoundary>
                </div>
              </div>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
