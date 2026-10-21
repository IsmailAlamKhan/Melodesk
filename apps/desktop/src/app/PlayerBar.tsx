import { IconButton, Slider, Tooltip, cn } from '@melodesk/ui';
import { Img, Slot, runAction, useHasAction } from '../core';
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
import { create } from 'zustand';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { run } from '../data/innertube';
import { queryClient } from '../data/queryClient';
import { useT } from '../i18n';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';
import { toast } from './toast';
import { useArtworkColor } from '../appearance/artworkAccent';
import { usePositionMs } from '../player/usePositionMs';

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${String(h)}:${String(m).padStart(2, '0')}:${sec}` : `${String(m)}:${sec}`;
}

export function PlayerBar() {
  const t = useT();
  const navigate = useNavigate();
  const ready = usePlayerStore((s) => s.ready);
  const state = usePlayerStore((s) => s.state);
  const track = usePlayerStore((s) => s.track);
  const queue = usePlayerStore((s) => s.queue);
  const flags = usePlayerStore((s) => s.flags);
  const loggedIn = usePlayerStore((s) => s.loggedIn);
  const artRgb = useArtworkColor(track?.artworkUrl ?? null);
  const canOpenNowPlaying = useHasAction('nowPlaying.open');

  const disabled = !ready || !state || !track;
  const playing = state?.playing ?? false;
  const volume = state?.volume ?? 1;
  const muted = state?.muted ?? false;
  const like = flags?.likeStatus ?? null;

  const setLike = async (status: 'LIKE' | 'DISLIKE' | 'INDIFFERENT'): Promise<void> => {
    if (!track?.videoId) return;
    if (!loggedIn) {
      toast(t('player.signInToLike'));
      return;
    }
    const endpoint =
      status === 'LIKE' ? 'like/like' : status === 'DISLIKE' ? 'like/dislike' : 'like/removelike';
    await run({ endpoint, body: { target: { videoId: track.videoId } } });
    usePlayerStore.setState((s) => (s.flags ? { flags: { ...s.flags, likeStatus: status } } : {}));
    void queryClient.invalidateQueries({ queryKey: ['browse'] });
    toast(
      status === 'LIKE'
        ? t('player.savedToLiked')
        : status === 'DISLIKE'
          ? t('player.disliked')
          : t('player.removedFromLiked'),
    );
  };

  const dot =
    'relative after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-accent';
  const tint = {
    '--bar-tint': artRgb
      ? `rgb(${artRgb.map((c) => String(Math.round(c))).join(' ')})`
      : 'var(--color-accent)',
  } as CSSProperties;

  return (
    <footer
      aria-label={t('player.region')}
      style={tint}
      className="player-bar group/bar relative grid h-[88px] grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-6 bg-bg-elevated/80 bg-[image:linear-gradient(to_right,color-mix(in_srgb,var(--bar-tint)_26%,transparent),transparent_55%)] px-6 shadow-[0_-12px_32px_-12px_rgb(0_0_0/0.35)] backdrop-blur-xl"
    >
      <SeekLine disabled={disabled} />
      <div className="flex min-w-0 items-center gap-4">
        {track?.artworkUrl && canOpenNowPlaying ? (
          <Tooltip label={t('player.openNowPlaying')}>
            <button
              type="button"
              aria-label={t('player.openNowPlaying')}
              onClick={() => runAction('nowPlaying.open')}
              className="shrink-0 rounded-lg shadow-lg ring-1 ring-white/10 transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Img
                src={track.artworkUrl}
                alt=""
                className="size-14 rounded-lg bg-bg-overlay object-cover"
              />
            </button>
          </Tooltip>
        ) : track?.artworkUrl ? (
          <Img
            src={track.artworkUrl}
            alt=""
            className="size-14 shrink-0 rounded-lg bg-bg-overlay object-cover shadow-lg ring-1 ring-white/10"
          />
        ) : (
          <div className="size-14 shrink-0 rounded-lg bg-bg-overlay" />
        )}
        <div className="min-w-0">
          <div className="truncate text-[15px] leading-tight font-semibold">
            {track?.title ?? t('player.nothingPlaying')}
          </div>
          <button
            type="button"
            className="mt-0.5 max-w-full truncate text-[13px] text-fg-muted hover:text-fg hover:underline"
            onClick={() =>
              track &&
              navigate(`/search?q=${encodeURIComponent(track.artist.split(' • ')[0] ?? '')}`)
            }
          >
            {track?.artist ?? ''}
          </button>
        </div>
        {track && (
          <div className="ms-1 flex shrink-0 items-center">
            <IconButton
              label={like === 'LIKE' ? t('player.removeLike') : t('player.like')}
              size="sm"
              onClick={() => void setLike(like === 'LIKE' ? 'INDIFFERENT' : 'LIKE')}
            >
              <Heart className={cn(like === 'LIKE' && 'fill-current text-accent')} />
            </IconButton>
            <IconButton
              label={like === 'DISLIKE' ? t('player.removeDislike') : t('player.dislike')}
              size="sm"
              className={cn(
                'transition-opacity',
                like !== 'DISLIKE' &&
                  'opacity-0 group-hover/bar:opacity-100 focus-visible:opacity-100',
              )}
              onClick={() => void setLike(like === 'DISLIKE' ? 'INDIFFERENT' : 'DISLIKE')}
            >
              <ThumbsDown className={cn(like === 'DISLIKE' && 'fill-current')} />
            </IconButton>
          </div>
        )}
      </div>

      <div dir="ltr" className="flex items-center justify-center gap-3">
        <TimeLabel kind="elapsed" className="text-right" />
        <div className="flex items-center gap-1">
          <IconButton
            label={queue?.shuffle ? t('player.shuffleOn') : t('player.shuffle')}
            size="sm"
            disabled={disabled}
            aria-pressed={queue?.shuffle ?? false}
            className={cn(queue?.shuffle && ['text-accent', dot])}
            onClick={() =>
              void sendCommand({ type: 'setShuffle', enabled: !(queue?.shuffle ?? false) })
            }
          >
            <Shuffle />
          </IconButton>
          <IconButton
            label={t('player.previous')}
            disabled={disabled}
            onClick={() => void sendCommand({ type: 'previous' })}
          >
            <SkipBack />
          </IconButton>
          <IconButton
            label={playing ? t('player.pause') : t('player.play')}
            variant="solid"
            size="xl"
            className="mx-1 shadow-lg hover:scale-105"
            disabled={disabled}
            onClick={() => void sendCommand({ type: 'toggle' })}
          >
            {playing ? <Pause /> : <Play className="translate-x-px" />}
          </IconButton>
          <IconButton
            label={t('player.next')}
            disabled={disabled}
            onClick={() => void sendCommand({ type: 'next' })}
          >
            <SkipForward />
          </IconButton>
          <IconButton
            label={
              queue?.repeat === 'one'
                ? t('player.repeatOne')
                : queue?.repeat === 'all'
                  ? t('player.repeatAll')
                  : t('player.repeat')
            }
            size="sm"
            disabled={disabled}
            aria-pressed={(queue?.repeat ?? 'off') !== 'off'}
            className={cn(queue?.repeat && queue.repeat !== 'off' && ['text-accent', dot])}
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
        <TimeLabel kind="total" />
      </div>

      <div className="flex items-center justify-end gap-1">
        {track && (
          <IconButton
            label={flags?.isVideo ? t('player.switchToSong') : t('player.switchToVideo')}
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
        <Slot name="playerBar.end" />
        <span aria-hidden className="mx-2 h-5 w-px bg-border" />
        <IconButton
          label={muted ? t('player.unmute') : t('player.mute')}
          size="sm"
          disabled={disabled}
          onClick={() => void sendCommand({ type: 'setMuted', muted: !muted })}
        >
          {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
        </IconButton>
        <Slider
          label={t('player.volume')}
          valueLabel={(v) => `${String(Math.round(v * 100))}%`}
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

/** The value being dragged on the seek line, shared so the time labels follow it. */
const useScrub = create<{ value: number | null }>(() => ({ value: null }));

/** Edge-to-edge progress line along the top of the bar; thickens on hover. */
function SeekLine({ disabled }: { disabled: boolean }) {
  const t = useT();
  const duration = usePlayerStore((s) => s.state?.duration ?? 0);
  const positionS = usePositionMs(120) / 1000;
  const scrub = useScrub((s) => s.value);
  return (
    <div className="absolute inset-x-0 top-0 z-10 -translate-y-1/2">
      <Slider
        variant="line"
        label={t('player.seek')}
        valueLabel={fmt}
        value={scrub ?? (duration ? Math.min(positionS, duration) : 0)}
        max={duration}
        step={0.5}
        disabled={disabled || duration === 0}
        onChange={(v) => useScrub.setState({ value: v })}
        onCommit={(v) => {
          useScrub.setState({ value: null });
          void sendCommand({ type: 'seek', seconds: v });
        }}
      />
    </div>
  );
}

/** Elapsed or total time. Only this re-renders as the song plays, not the whole bar. */
function TimeLabel({ kind, className }: { kind: 'elapsed' | 'total'; className?: string }) {
  const duration = usePlayerStore((s) => s.state?.duration ?? 0);
  const positionS = usePositionMs(250) / 1000;
  const scrub = useScrub((s) => s.value);
  const seconds =
    kind === 'total' ? duration : (scrub ?? Math.min(positionS, duration || positionS));
  return (
    <span className={cn('w-11 text-xs tabular-nums text-fg-subtle', className)}>
      {fmt(seconds)}
    </span>
  );
}
