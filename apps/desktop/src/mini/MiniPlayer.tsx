import { IconButton, Slider, cn } from '@melodesk/ui';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import {
  Image as ImageIcon,
  Maximize2,
  Pause,
  Pin,
  PinOff,
  Play,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';

type Mode = 'compact' | 'artwork';

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

function usePosition(): number {
  const state = usePlayerStore((s) => s.state);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state?.playing) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
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

/** Always-on-top floating player: compact bar or artwork tile, resizable, in its own window. */
export function MiniPlayer() {
  const track = usePlayerStore((s) => s.track);
  const state = usePlayerStore((s) => s.state);
  const ready = usePlayerStore((s) => s.ready);
  const position = usePosition();
  const [mode, setMode] = useState<Mode>(() => {
    try {
      return localStorage.getItem('mini.mode') === 'artwork' ? 'artwork' : 'compact';
    } catch {
      return 'compact';
    }
  });
  const [pinned, setPinned] = useState(true);
  const playing = state?.playing ?? false;
  const win = getCurrentWindow();

  useEffect(() => {
    try {
      localStorage.setItem('mini.mode', mode);
    } catch {
      /* private mode */
    }
    void win
      .setSize(mode === 'artwork' ? new LogicalSizeLike(300, 300) : new LogicalSizeLike(360, 120))
      .catch(() => undefined);
  }, [mode, win]);

  useEffect(() => {
    void sendCommand({ type: 'requestState' }).catch(() => undefined);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === ' ') {
        e.preventDefault();
        void sendCommand({ type: 'toggle' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const controls = (
    <div className="flex items-center gap-1">
      <IconButton
        label="Previous"
        size="sm"
        disabled={!ready}
        onClick={() => void sendCommand({ type: 'previous' })}
      >
        <SkipBack />
      </IconButton>
      <IconButton
        label={playing ? 'Pause' : 'Play'}
        variant="solid"
        size="md"
        disabled={!ready}
        onClick={() => void sendCommand({ type: 'toggle' })}
      >
        {playing ? <Pause /> : <Play className="translate-x-px" />}
      </IconButton>
      <IconButton
        label="Next"
        size="sm"
        disabled={!ready}
        onClick={() => void sendCommand({ type: 'next' })}
      >
        <SkipForward />
      </IconButton>
    </div>
  );
  const windowButtons = (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      <IconButton
        label={mode === 'artwork' ? 'Compact mode' : 'Artwork mode'}
        size="sm"
        onClick={() => setMode(mode === 'artwork' ? 'compact' : 'artwork')}
      >
        <ImageIcon />
      </IconButton>
      <IconButton
        label={pinned ? 'Unpin from top' : 'Pin on top'}
        size="sm"
        onClick={() => {
          const next = !pinned;
          setPinned(next);
          void win.setAlwaysOnTop(next);
        }}
      >
        {pinned ? <PinOff /> : <Pin />}
      </IconButton>
      <IconButton
        label="Open Melodesk"
        size="sm"
        onClick={() =>
          void invoke('player_set_visible', { visible: false }).then(() => emitShowMain())
        }
      >
        <Maximize2 />
      </IconButton>
      <IconButton label="Close mini player" size="sm" onClick={() => void win.hide()}>
        <X />
      </IconButton>
    </div>
  );

  if (mode === 'artwork') {
    return (
      <div
        data-tauri-drag-region
        className="group relative h-screen w-screen overflow-hidden rounded-xl bg-bg"
      >
        {track?.artworkUrl && (
          <img
            src={track.artworkUrl}
            alt=""
            className="pointer-events-none absolute inset-0 size-full object-cover"
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 to-transparent" />
        <div className="absolute top-1 right-1">{windowButtons}</div>
        <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2 text-white">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {track?.title ?? 'Nothing playing'}
            </div>
            <div className="truncate text-xs text-white/70">{track?.artist ?? ''}</div>
          </div>
          <div className="flex items-center justify-between">
            {controls}
            <span className="text-[11px] tabular-nums text-white/70">{fmt(position)}</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      data-tauri-drag-region
      className="group flex h-screen w-screen flex-col justify-between overflow-hidden rounded-xl border border-border bg-bg-elevated p-2"
    >
      <div className="flex items-center gap-3">
        {track?.artworkUrl ? (
          <img src={track.artworkUrl} alt="" className="size-14 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="size-14 shrink-0 rounded-md bg-bg-overlay" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{track?.title ?? 'Nothing playing'}</div>
          <div className="truncate text-xs text-fg-muted">{track?.artist ?? ''}</div>
        </div>
        {controls}
        {windowButtons}
      </div>
      <div className={cn('flex items-center gap-2 px-1 text-[11px] tabular-nums text-fg-subtle')}>
        <span>{fmt(position)}</span>
        <Slider
          label="Seek"
          value={position}
          max={state?.duration ?? 0}
          step={0.5}
          disabled={!state?.duration}
          onCommit={(v) => void sendCommand({ type: 'seek', seconds: v })}
        />
        <span>{fmt(state?.duration ?? 0)}</span>
      </div>
    </div>
  );
}

const LogicalSizeLike = LogicalSize;

async function emitShowMain(): Promise<void> {
  const { emit } = await import('@tauri-apps/api/event');
  await emit('app:show-main');
}
