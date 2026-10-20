import { IconButton, Slider, cn } from '@melodesk/ui';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';
import { LyricsPanel } from './LyricsPanel';
import { useUiStore } from './uiStore';

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
  const open = useUiStore((s) => s.nowPlayingOpen);
  const close = useUiStore((s) => s.setNowPlayingOpen);
  const track = usePlayerStore((s) => s.track);
  const state = usePlayerStore((s) => s.state);
  const queue = usePlayerStore((s) => s.queue);
  const position = usePosition();
  const [scrub, setScrub] = useState<number | null>(null);
  const accent = useArtworkAccent(track?.artworkUrl ?? null);
  useNavigate();

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
          aria-label="Now playing"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-30 overflow-hidden bg-bg text-fg"
          style={{ ['--np-accent' as string]: accent ?? 'var(--color-accent)' }}
        >
          {track?.artworkUrl && (
            <img
              src={track.artworkUrl}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full scale-125 object-cover opacity-50 blur-3xl"
            />
          )}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklch,var(--np-accent)_35%,transparent),transparent_60%),linear-gradient(to_bottom,transparent,var(--color-bg)_120%)]" />
          <div
            data-tauri-drag-region
            className="absolute inset-x-0 top-0 flex h-14 items-center justify-end px-3 pt-2"
          >
            <IconButton label="Close now playing" onClick={() => close(false)}>
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
                  <img src={track.artworkUrl} alt="" className="size-full object-cover" />
                )}
              </motion.div>
              <div className="w-full max-w-md">
                <h1 className="truncate font-display text-3xl font-bold tracking-tight">
                  {track?.title ?? 'Nothing playing'}
                </h1>
                <p className="truncate text-lg text-fg-muted">{track?.artist ?? ''}</p>
                <div className="mt-6 flex items-center gap-3 text-xs tabular-nums text-fg-subtle">
                  <span className="w-12 text-right">{fmt(scrub ?? position)}</span>
                  <Slider
                    label="Seek"
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
                <div className="mt-4 flex items-center justify-center gap-3">
                  <IconButton
                    label="Shuffle"
                    aria-pressed={queue?.shuffle ?? false}
                    className={cn(queue?.shuffle && 'text-[var(--np-accent)]')}
                    onClick={() =>
                      void sendCommand({ type: 'setShuffle', enabled: !(queue?.shuffle ?? false) })
                    }
                  >
                    <Shuffle />
                  </IconButton>
                  <IconButton
                    label="Previous"
                    size="lg"
                    onClick={() => void sendCommand({ type: 'previous' })}
                  >
                    <SkipBack />
                  </IconButton>
                  <button
                    type="button"
                    aria-label={playing ? 'Pause' : 'Play'}
                    onClick={() => void sendCommand({ type: 'toggle' })}
                    className="flex size-16 items-center justify-center rounded-full bg-fg text-bg shadow-lg transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    {playing ? (
                      <Pause className="size-7" />
                    ) : (
                      <Play className="size-7 translate-x-0.5" />
                    )}
                  </button>
                  <IconButton
                    label="Next"
                    size="lg"
                    onClick={() => void sendCommand({ type: 'next' })}
                  >
                    <SkipForward />
                  </IconButton>
                  <IconButton
                    label="Repeat"
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

/** Average color of the artwork (when the image host allows canvas reads), as an oklch-friendly rgb string. */
function useArtworkAccent(url: string | null): string | null {
  const [sampled, setSampled] = useState<{ url: string; accent: string | null } | null>(null);
  const setAccent = (accent: string | null): void => {
    if (url) setSampled({ url, accent });
  };
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const [cr, cg, cb] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
          const max = Math.max(cr, cg, cb);
          const min = Math.min(cr, cg, cb);
          if (max - min < 24) continue; // skip greys so the accent stays colorful
          r += cr;
          g += cg;
          b += cb;
          n += 1;
        }
        if (!cancelled)
          setAccent(
            n
              ? `rgb(${String(Math.round(r / n))} ${String(Math.round(g / n))} ${String(Math.round(b / n))})`
              : null,
          );
      } catch {
        if (!cancelled) setAccent(null); // tainted canvas: host without CORS
      }
    };
    img.onerror = () => {
      if (!cancelled) setAccent(null);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return url && sampled?.url === url ? sampled.accent : null;
}

export { useArtworkAccent };
