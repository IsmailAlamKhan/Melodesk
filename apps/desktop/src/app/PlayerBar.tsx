import { IconButton, Slider, cn } from '@melodesk/ui';
import {
  Heart,
  MonitorPlay,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  ThumbsDown,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { run } from '../data/innertube';
import { queryClient } from '../data/queryClient';
import { requests } from '@melodesk/adapter';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';
import { toast } from './toast';

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${String(h)}:${String(m).padStart(2, '0')}:${sec}` : `${String(m)}:${sec}`;
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
  const navigate = useNavigate();
  const ready = usePlayerStore((s) => s.ready);
  const state = usePlayerStore((s) => s.state);
  const track = usePlayerStore((s) => s.track);
  const queue = usePlayerStore((s) => s.queue);
  const flags = usePlayerStore((s) => s.flags);
  const loggedIn = usePlayerStore((s) => s.loggedIn);
  const position = useInterpolatedPosition();
  const [scrub, setScrub] = useState<number | null>(null);

  const disabled = !ready || !state || !track;
  const playing = state?.playing ?? false;
  const duration = state?.duration ?? 0;
  const volume = state?.volume ?? 1;
  const muted = state?.muted ?? false;
  const like = flags?.likeStatus ?? null;

  const setLike = async (status: 'LIKE' | 'DISLIKE' | 'INDIFFERENT'): Promise<void> => {
    if (!track?.videoId) return;
    if (!loggedIn) {
      toast('Sign in to like songs');
      return;
    }
    const endpoint =
      status === 'LIKE' ? 'like/like' : status === 'DISLIKE' ? 'like/dislike' : 'like/removelike';
    await run({ endpoint, body: { target: { videoId: track.videoId } } });
    usePlayerStore.setState((s) => (s.flags ? { flags: { ...s.flags, likeStatus: status } } : {}));
    void queryClient.invalidateQueries({ queryKey: ['browse'] });
    toast(
      status === 'LIKE'
        ? 'Saved to Liked Music'
        : status === 'DISLIKE'
          ? 'Disliked'
          : 'Removed from Liked Music',
    );
  };

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
          <button
            type="button"
            className="max-w-full truncate text-xs text-fg-muted hover:underline"
            onClick={() =>
              track &&
              navigate(`/search?q=${encodeURIComponent(track.artist.split(' • ')[0] ?? '')}`)
            }
          >
            {track?.artist ?? ''}
          </button>
        </div>
        {track && (
          <div className="ml-1 flex items-center">
            <IconButton
              label={like === 'DISLIKE' ? 'Remove dislike' : 'Dislike'}
              size="sm"
              onClick={() => void setLike(like === 'DISLIKE' ? 'INDIFFERENT' : 'DISLIKE')}
            >
              <ThumbsDown className={cn(like === 'DISLIKE' && 'fill-current')} />
            </IconButton>
            <IconButton
              label={like === 'LIKE' ? 'Remove from Liked Music' : 'Like'}
              size="sm"
              onClick={() => void setLike(like === 'LIKE' ? 'INDIFFERENT' : 'LIKE')}
            >
              <Heart className={cn(like === 'LIKE' && 'fill-current text-accent')} />
            </IconButton>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1">
          <IconButton
            label={queue?.shuffle ? 'Shuffle on' : 'Shuffle'}
            size="sm"
            disabled={disabled}
            aria-pressed={queue?.shuffle ?? false}
            className={cn(queue?.shuffle && 'text-accent')}
            onClick={() =>
              void sendCommand({ type: 'setShuffle', enabled: !(queue?.shuffle ?? false) })
            }
          >
            <Shuffle />
          </IconButton>
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
          <IconButton
            label={
              queue?.repeat === 'one'
                ? 'Repeat one'
                : queue?.repeat === 'all'
                  ? 'Repeat all'
                  : 'Repeat'
            }
            size="sm"
            disabled={disabled}
            aria-pressed={(queue?.repeat ?? 'off') !== 'off'}
            className={cn(queue?.repeat && queue.repeat !== 'off' && 'text-accent')}
            onClick={() =>
              void sendCommand({
                type: 'setRepeat',
                mode:
                  queue?.repeat === 'off' || !queue
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

      <div className="flex items-center justify-end gap-1">
        {track && (
          <IconButton
            label={flags?.isVideo ? 'Switch to song' : 'Switch to video'}
            size="sm"
            aria-pressed={flags?.isVideo ?? false}
            className={cn(flags?.isVideo && 'text-accent')}
            onClick={() =>
              void sendCommand({ type: 'setVideoMode', video: !(flags?.isVideo ?? false) })
            }
          >
            <MonitorPlay />
          </IconButton>
        )}
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

export { requests };
