import { IconButton, Slider } from '@melodesk/ui';
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m)}:${String(s % 60).padStart(2, '0')}`;
}

/** Interpolates position between bridge samples so the seek bar moves at 60 fps, not 2 fps. */
function useInterpolatedPosition(): number {
  const state = usePlayerStore((s) => s.state);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state?.playing) return;
    let raf = 0;
    const loop = (): void => {
      setNow(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [state?.playing]);
  if (!state) return 0;
  if (!state.playing) return state.position;
  const elapsed = Math.max(0, now - state.sampledAt) / 1000;
  return Math.min(state.duration || Infinity, state.position + elapsed);
}

export function PlayerBar() {
  const ready = usePlayerStore((s) => s.ready);
  const state = usePlayerStore((s) => s.state);
  const track = usePlayerStore((s) => s.track);
  const position = useInterpolatedPosition();
  const [scrub, setScrub] = useState<number | null>(null);

  const disabled = !ready || !state;
  const playing = state?.playing ?? false;
  const duration = state?.duration ?? 0;
  const volume = state?.volume ?? 1;
  const muted = state?.muted ?? false;

  return (
    <footer
      aria-label="Player"
      className="grid h-20 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-4 border-t border-border bg-bg-elevated px-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        {track?.artworkUrl ? (
          <img
            src={track.artworkUrl}
            alt=""
            className="size-12 shrink-0 rounded-sm bg-bg-overlay object-cover"
          />
        ) : (
          <div className="size-12 shrink-0 rounded-sm bg-bg-overlay" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{track?.title ?? 'Nothing playing'}</div>
          <div className="truncate text-xs text-fg-muted">{track?.artist ?? ''}</div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <IconButton
            label="Previous"
            disabled={disabled}
            onClick={() => void sendCommand({ type: 'previous' })}
          >
            <SkipBack />
          </IconButton>
          <IconButton
            label={playing ? 'Pause' : 'Play'}
            variant="solid"
            disabled={disabled}
            onClick={() => void sendCommand({ type: 'toggle' })}
          >
            {playing ? <Pause /> : <Play className="translate-x-px" />}
          </IconButton>
          <IconButton
            label="Next"
            disabled={disabled}
            onClick={() => void sendCommand({ type: 'next' })}
          >
            <SkipForward />
          </IconButton>
        </div>
        <div className="flex w-full max-w-xl items-center gap-2 text-xs tabular-nums text-fg-subtle">
          <span className="w-10 text-right">{fmt(scrub ?? position)}</span>
          <Slider
            label="Seek"
            value={scrub ?? position}
            max={duration}
            step={0.5}
            disabled={disabled || duration === 0}
            onChange={setScrub}
            onCommit={(v) => {
              setScrub(null);
              void sendCommand({ type: 'seek', seconds: v });
            }}
          />
          <span className="w-10">{fmt(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <IconButton
          label={muted ? 'Unmute' : 'Mute'}
          size="sm"
          disabled={disabled}
          onClick={() => void sendCommand({ type: 'setMuted', muted: !muted })}
        >
          {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
        </IconButton>
        <Slider
          label="Volume"
          className="w-28"
          value={muted ? 0 : volume}
          max={1}
          step={0.01}
          disabled={disabled}
          onCommit={(v) => void sendCommand({ type: 'setVolume', volume: v })}
        />
      </div>
    </footer>
  );
}
