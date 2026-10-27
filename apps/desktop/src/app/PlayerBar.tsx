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
import { useT } from '../i18n';
import { setLikeStatus } from '../player/like';
import { sendCommand, setPlayerVisible } from '../player/ipc';
import { usePlayerStore } from '../player/store';
import { useVolume } from '../player/useVolume';
import { ArtistLinks } from './components/ArtistLinks';
import { BeatGlow } from './components/BeatGlow';
import { BeatRing } from './components/BeatRing';
import { LiveBars } from './components/LiveBars';
import { Marquee } from './components/Marquee';
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
  const ready = usePlayerStore((s) => s.ready);
  const state = usePlayerStore((s) => s.state);
  const track = usePlayerStore((s) => s.track);
  const queue = usePlayerStore((s) => s.queue);
  const flags = usePlayerStore((s) => s.flags);
  // Liking and the video picture belong to YouTube Music songs.
  const fromYouTube = usePlayerStore((s) => s.source === 'youtube');
  const artRgb = useArtworkColor(track?.artworkUrl ?? null);
  const canOpenNowPlaying = useHasAction('nowPlaying.open');

  // A local song plays without the web player, so its controls do not wait for it.
  const disabled = (!ready && fromYouTube) || !state || !track;
  const playing = state?.playing ?? false;
  const volume = state?.volume ?? 1;
  const muted = state?.muted ?? false;
  const volumeProps = useVolume();
  const like = flags?.likeStatus ?? null;

  const setLike = setLikeStatus;

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
      className="player-bar group/bar relative grid h-16 max-rail:rounded-2xl max-rail:border max-rail:border-border/60 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-bg-elevated/80 wide:h-[88px] wide:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] wide:gap-6 bg-[image:linear-gradient(to_right,color-mix(in_srgb,var(--bar-tint)_26%,transparent),transparent_55%)] px-3 shadow-[0_-12px_32px_-12px_rgb(0_0_0/0.35)] backdrop-blur-xl wide:px-6"
    >
      <SeekLine disabled={disabled} />
      <div className="flex min-w-0 items-center gap-3 wide:gap-4">
        <div className="relative shrink-0">
          <BeatGlow />
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
                  className="size-11 rounded-lg bg-bg-overlay object-cover wide:size-14"
                />
              </button>
            </Tooltip>
          ) : track?.artworkUrl ? (
            <Img
              src={track.artworkUrl}
              alt=""
              className="size-11 shrink-0 rounded-lg bg-bg-overlay object-cover shadow-lg ring-1 ring-white/10 wide:size-14"
            />
          ) : (
            <div className="size-11 shrink-0 rounded-lg bg-bg-overlay wide:size-14" />
          )}
        </div>
        <div
          className="min-w-0"
          onClick={(e) => {
            // On a narrow window the player is a card: tapping it opens Now Playing.
            if (
              canOpenNowPlaying &&
              window.matchMedia('(max-width: 599px)').matches &&
              !(e.target instanceof Element && e.target.closest('a, button'))
            )
              runAction('nowPlaying.open');
          }}
        >
          <div className="flex items-center gap-2">
            <Marquee
              label={track?.title ?? t('player.nothingPlaying')}
              className="min-w-0 text-[15px] leading-tight font-semibold"
            >
              {track?.title ?? t('player.nothingPlaying')}
            </Marquee>
            {playing && <LiveBars bars={4} className="shrink-0 text-accent" />}
          </div>
          <ArtistLinks
            byline={track?.artist ?? ''}
            className="mt-0.5 block max-w-full truncate text-[13px] text-fg-muted"
          />
          {fromYouTube && flags?.adPlaying && (
            <div className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
              <span>{t('player.adPlaying')}</span>
              {/* The page's own Skip button, pressed when asked; the ad is never hidden or blocked. */}
              <button
                type="button"
                disabled={!flags.adSkippable}
                title={flags.adSkippable ? undefined : t('player.adNotSkippable')}
                onClick={() => void sendCommand({ type: 'skipAd' })}
                className="rounded-full bg-bg-overlay px-2.5 py-0.5 font-medium text-fg hover:bg-accent-soft hover:text-accent disabled:pointer-events-none disabled:opacity-50"
              >
                {t('player.skipAd')}
              </button>
            </div>
          )}
        </div>
        {track && fromYouTube && (
          <div className="ms-1 flex shrink-0 items-center max-rail:hidden">
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
                'transition-opacity max-wide:hidden',
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

      <div dir="ltr" className="flex items-center justify-center gap-1 wide:gap-3">
        <TimeLabel kind="elapsed" className="text-right max-wide:hidden" />
        <div className="flex items-center gap-1">
          <IconButton
            label={queue?.shuffle ? t('player.shuffleOn') : t('player.shuffle')}
            size="sm"
            disabled={disabled}
            aria-pressed={queue?.shuffle ?? false}
            className={cn('max-wide:hidden', queue?.shuffle && ['text-accent', dot])}
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
          <span className="relative mx-1">
            <BeatRing />
            <IconButton
              label={playing ? t('player.pause') : t('player.play')}
              variant="solid"
              size="xl"
              className="shadow-lg hover:scale-105 max-wide:size-12"
              disabled={disabled}
              onClick={() => void sendCommand({ type: 'toggle' })}
            >
              {playing ? <Pause /> : <Play className="translate-x-px" />}
            </IconButton>
          </span>
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
            className={cn(
              'max-wide:hidden',
              queue?.repeat && queue.repeat !== 'off' && ['text-accent', dot],
            )}
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
        <TimeLabel kind="total" className="max-wide:hidden" />
      </div>

      <div className="hidden items-center justify-end gap-1 wide:flex">
        {track && fromYouTube && (
          <IconButton
            label={
              flags?.videoAvailable === false
                ? t('player.noVideo')
                : flags?.isVideo
                  ? t('player.switchToSong')
                  : t('player.switchToVideo')
            }
            size="sm"
            aria-pressed={flags?.isVideo ?? false}
            disabled={flags?.videoAvailable === false}
            className={cn(flags?.isVideo && 'text-accent')}
            onClick={() => {
              const video = !(flags?.isVideo ?? false);
              void sendCommand({ type: 'setVideoMode', video });
              // The picture only exists in the player window, so bring it up (and put it away
              // again when going back to audio).
              void setPlayerVisible(video);
            }}
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
          {...volumeProps}
          max={1}
          step={0.01}
          disabled={disabled}
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
