import { IconButton, Slider, Tooltip, cn } from '@melodesk/ui';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  MicVocal,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toHex } from '../appearance/color';
import { useArtworkColor } from '../appearance/artworkAccent';
import { useT } from '../i18n';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';
import { LyricsPanel } from './LyricsPanel';
import { useUiStore } from './uiStore';
import { CachedImg } from '../artwork/CachedImg';

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

/**
 * Full-screen Now Playing: artwork, blurred artwork backdrop with an accent gradient sampled
 * from the art, big controls, and the synced lyrics column. Escape or the chevron closes it.
 */
export function NowPlayingView() {
  const t = useT();
  const open = useUiStore((s) => s.nowPlayingOpen);
  const close = useUiStore((s) => s.setNowPlayingOpen);
  const openKaraoke = useUiStore((s) => s.setKaraokeOpen);
  const track = usePlayerStore((s) => s.track);
  const state = usePlayerStore((s) => s.state);
  const queue = usePlayerStore((s) => s.queue);
  const position = usePosition();
  const [scrub, setScrub] = useState<number | null>(null);
  const artRgb = useArtworkColor(track?.artworkUrl ?? null);
  const accent = artRgb ? toHex(artRgb) : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close(false);
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        void sendCommand({ type: 'toggle' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const playing = state?.playing ?? false;
  const duration = state?.duration ?? 0;
  return (
    <AnimatePresence>
      {open && (
        <motion.section
          aria-label={t('nowPlaying.region')}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-30 overflow-hidden bg-bg text-fg"
          style={{ ['--np-accent' as string]: accent ?? 'var(--color-accent)' }}
        >
          {track?.artworkUrl && (
            <CachedImg
              src={track.artworkUrl}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-50 blur-3xl"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklch,var(--np-accent)_35%,transparent),transparent_60%),linear-gradient(to_bottom,transparent,var(--color-bg)_120%)]" />
          <div
            data-tauri-drag-region
            className="absolute inset-x-0 top-0 z-10 flex h-14 items-center justify-end gap-1 px-3 pt-2"
          >
            <IconButton label={t('karaoke.open')} onClick={() => openKaraoke(true)}>
              <MicVocal />
            </IconButton>
            <IconButton label={t('nowPlaying.close')} onClick={() => close(false)}>
              <ChevronDown />
            </IconButton>
          </div>
          <div className="relative mx-auto grid h-full max-w-7xl grid-cols-1 items-center gap-10 px-10 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col items-center gap-8 lg:items-start">
              <motion.div
                key={track?.videoId ?? 'none'}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="aspect-square w-full max-w-md overflow-hidden rounded-2xl bg-bg-overlay shadow-2xl"
              >
                {track?.artworkUrl && (
                  <CachedImg src={track.artworkUrl} alt="" className="size-full object-cover" />
                )}
              </motion.div>
              <div className="w-full max-w-md">
                <h1 className="truncate font-display text-3xl font-bold tracking-tight">
                  {track?.title ?? t('player.nothingPlaying')}
                </h1>
                <p className="truncate text-lg text-fg-muted">{track?.artist ?? ''}</p>
                <div
                  dir="ltr"
                  className="mt-6 flex items-center gap-3 text-xs tabular-nums text-fg-subtle"
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
                <div dir="ltr" className="mt-4 flex items-center justify-center gap-3">
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
                  <Tooltip label={playing ? t('player.pause') : t('player.play')}>
                    <button
                      type="button"
                      aria-label={playing ? t('player.pause') : t('player.play')}
                      onClick={() => void sendCommand({ type: 'toggle' })}
                      className={cn(
                        'state-layer m3-motion flex size-16 items-center justify-center bg-primary text-on-primary shadow-lg hover:scale-105 focus-visible:outline-2 focus-visible:outline-primary',
                        playing ? 'rounded-[32px]' : 'rounded-[22px]',
                      )}
                    >
                      {playing ? (
                        <Pause className="size-7" />
                      ) : (
                        <Play className="size-7 translate-x-0.5" />
                      )}
                    </button>
                  </Tooltip>
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
              </div>
            </div>
            <div className="hidden h-[70vh] min-h-0 lg:block">
              <LyricsPanel large />
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
