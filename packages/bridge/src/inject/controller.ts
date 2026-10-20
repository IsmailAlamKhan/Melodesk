import type { PlaybackState, PlayerCommand, Track } from '../protocol';
import type { YtPlayerElement } from './player-api';
import { REQUIRED_PLAYER_METHODS } from './player-api';
import { selectors } from './selectors.v1';
import { emit, log } from './transport';

const BOOT_TIMEOUT_MS = 30_000;
const POLL_MS = 250;
const METADATA_POLL_MS = 1000;
const TIMEUPDATE_MIN_INTERVAL_MS = 500;

/**
 * Owns the lifecycle of the bridge inside the music.youtube.com page: finds the
 * player, subscribes to media events, publishes state/track/health, and executes
 * commands coming from the host.
 */
export class BridgeController {
  private player: YtPlayerElement | null = null;
  private video: HTMLVideoElement | null = null;
  private lastTrackKey = '';
  private lastTimeupdateAt = 0;
  private healthStatus: 'ok' | 'degraded' | 'broken' = 'ok';
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.watchNavigation();
    this.bootstrap();
  }

  /** Entry point for commands evaluated by the host. `cmd` is already serde-validated in Rust. */
  dispatch(cmd: unknown): void {
    if (!isCommand(cmd)) {
      log('warn', 'bridge: dropped malformed command');
      return;
    }
    try {
      this.execute(cmd);
    } catch (err) {
      log('error', `bridge: command ${cmd.type} failed: ${String(err)}`);
    }
  }

  // ---------------------------------------------------------------------------

  private bootstrap(): void {
    const startedAt = Date.now();
    const tick = (): void => {
      const player = document.querySelector<YtPlayerElement>(selectors.moviePlayer);
      const video = document.querySelector<HTMLVideoElement>(selectors.video);
      if (player && video) {
        this.attach(player, video);
        return;
      }
      if (Date.now() - startedAt > BOOT_TIMEOUT_MS) {
        // Logged-out users still get a player element; its absence means the markup changed.
        this.setHealth('broken', player ? 'video-element-missing' : 'player-element-missing');
        this.emitReady();
        // keep trying in the background in case the page is just slow
        window.setTimeout(tick, 5 * POLL_MS);
        return;
      }
      window.setTimeout(tick, POLL_MS);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tick, { once: true });
    } else {
      tick();
    }
  }

  private attach(player: YtPlayerElement, video: HTMLVideoElement): void {
    this.player = player;
    this.video = video;

    const missing = REQUIRED_PLAYER_METHODS.filter((m) => typeof player[m] !== 'function');
    if (missing.length > 0) {
      this.setHealth('degraded', `player-api-missing:${missing.join(',')}`);
    } else {
      this.setHealth('ok', null);
    }

    const onState = (): void => {
      this.emitState();
    };
    for (const ev of ['play', 'pause', 'ended', 'durationchange', 'volumechange', 'seeked']) {
      video.addEventListener(ev, onState);
    }
    video.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - this.lastTimeupdateAt >= TIMEUPDATE_MIN_INTERVAL_MS) {
        this.lastTimeupdateAt = now;
        this.emitState();
      }
    });
    video.addEventListener('loadedmetadata', () => {
      this.emitTrack(true);
      this.emitState();
    });

    // MediaSession metadata has no change event; poll cheaply and emit on change only.
    window.setInterval(() => {
      this.emitTrack(false);
    }, METADATA_POLL_MS);

    // YouTube Music replaces the <video> element in some flows (e.g. song/video toggle).
    const observer = new MutationObserver(() => {
      const current = document.querySelector<HTMLVideoElement>(selectors.video);
      if (current && current !== this.video) {
        observer.disconnect();
        this.attach(player, current);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    this.emitReady();
    this.emitTrack(true);
    this.emitState();
    log('info', `bridge ${__BRIDGE_VERSION__} attached`);
  }

  private watchNavigation(): void {
    let last = location.pathname + location.search;
    const check = (): void => {
      const now = location.pathname + location.search;
      if (now !== last) {
        last = now;
        emit({ type: 'navigation', path: now });
      }
    };
    window.addEventListener('popstate', check);
    // YTM uses history.pushState for in-app navigation; poll instead of monkey-patching history.
    window.setInterval(check, 500);
  }

  // ---------------------------------------------------------------------------

  private execute(cmd: PlayerCommand): void {
    const p = this.player;
    const v = this.video;
    switch (cmd.type) {
      case 'play':
        p?.playVideo?.();
        break;
      case 'pause':
        p?.pauseVideo?.();
        break;
      case 'toggle':
        if (v?.paused ?? true) p?.playVideo?.();
        else p?.pauseVideo?.();
        break;
      case 'next':
        p?.nextVideo?.();
        break;
      case 'previous':
        p?.previousVideo?.();
        break;
      case 'seek':
        p?.seekTo?.(cmd.seconds, true);
        break;
      case 'setVolume':
        p?.setVolume?.(Math.round(cmd.volume * 100));
        break;
      case 'setMuted':
        if (cmd.muted) p?.mute?.();
        else p?.unMute?.();
        break;
      case 'navigate':
        // Only same-origin paths; the schema already rejects anything that is not "/...".
        location.assign(new URL(cmd.path, 'https://music.youtube.com/').toString());
        break;
      case 'requestState':
        this.emitReady();
        this.emitTrack(true);
        this.emitState();
        break;
    }
  }

  // ---------------------------------------------------------------------------

  private emitReady(): void {
    emit({
      type: 'ready',
      bridgeVersion: __BRIDGE_VERSION__,
      protocolVersion: 1,
      loggedIn: isLoggedIn(),
    });
  }

  private emitState(): void {
    const v = this.video;
    const p = this.player;
    if (!v) return;
    const volumeFromApi = p?.getVolume?.();
    const volume =
      typeof volumeFromApi === 'number' && Number.isFinite(volumeFromApi)
        ? clamp(volumeFromApi / 100, 0, 1)
        : clamp(v.volume, 0, 1);
    const state: PlaybackState = {
      playing: !v.paused && !v.ended,
      position: finiteOr(v.currentTime, 0),
      duration: finiteOr(v.duration, 0),
      volume,
      muted: p?.isMuted?.() ?? v.muted,
      sampledAt: Date.now(),
    };
    emit({ type: 'state', state });
  }

  private emitTrack(force: boolean): void {
    const track = readTrack(this.player);
    const key = track
      ? `${track.videoId ?? ''}|${track.title}|${track.artist}|${track.artworkUrl ?? ''}`
      : '';
    if (!force && key === this.lastTrackKey) return;
    this.lastTrackKey = key;
    emit({ type: 'track', track });
  }

  private setHealth(status: 'ok' | 'degraded' | 'broken', reason: string | null): void {
    if (status === this.healthStatus && status === 'ok') return;
    this.healthStatus = status;
    emit({ type: 'health', status, reason });
  }
}

// -----------------------------------------------------------------------------

function readTrack(player: YtPlayerElement | null): Track | null {
  const meta = navigator.mediaSession.metadata;
  const data = player?.getVideoData?.();
  const title = meta?.title ?? data?.title ?? '';
  if (!title) return null;
  // MediaSession artist for YTM is "Artist • Album • Year" in some locales; keep it raw for now,
  // the adapter package owns smarter parsing.
  const artworkRaw = pickArtwork(meta?.artwork ?? []);
  return {
    videoId: data?.video_id ?? null,
    title: title.slice(0, 512),
    artist: (meta?.artist ?? data?.author ?? '').slice(0, 512),
    album: meta?.album ? meta.album.slice(0, 512) : null,
    artworkUrl: artworkRaw,
  };
}

function pickArtwork(list: readonly MediaImage[]): string | null {
  let best: MediaImage | null = null;
  let bestSize = -1;
  for (const img of list) {
    const size = Number.parseInt(img.sizes?.split('x')[0] ?? '0', 10) || 0;
    if (size > bestSize) {
      best = img;
      bestSize = size;
    }
  }
  const src = best?.src ?? null;
  return src?.startsWith('https://') ? src.slice(0, 2048) : null;
}

function isLoggedIn(): boolean {
  if (document.querySelector(selectors.avatarButton)) return true;
  if (document.querySelector(selectors.signInLink)) return false;
  // Unknown markup: assume logged out so the UI offers the sign-in flow rather than hiding it.
  return false;
}

function isCommand(cmd: unknown): cmd is PlayerCommand {
  return (
    typeof cmd === 'object' && cmd !== null && typeof (cmd as { type?: unknown }).type === 'string'
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function finiteOr(n: number, fallback: number): number {
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
