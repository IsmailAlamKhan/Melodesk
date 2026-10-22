import type {
  PlaybackState,
  PlayerCommand,
  PlayerFlags,
  QueueItem,
  QueueState,
  RepeatMode,
  Track,
} from '../protocol';
import type { YtPlayerElement } from './player-api';
import { REQUIRED_PLAYER_METHODS } from './player-api';
import {
  getApp,
  getNetworkManager,
  getPlayerBar,
  getQueueApi,
  getStore,
  keyNames,
  methodNames,
  propNames,
} from './page-api';
import { AudioEngine } from './audio';
import { watchIdlePrompt } from './idle-prompt';
import { isStaleTrack } from './staleTrack';
import { setVideoLayout } from './video-layout';
import { selectors } from './selectors.v1';
import { emit, log } from './transport';

const DATA_TIMEOUT_MS = 30_000;

const BOOT_TIMEOUT_MS = 30_000;
const POLL_MS = 250;
const METADATA_POLL_MS = 1000;
const TIMEUPDATE_MIN_INTERVAL_MS = 500;
/** How recently the music must have been playing for the idle question to be what paused it. */
const IDLE_RESUME_WINDOW_MS = 60_000;

/**
 * Owns the lifecycle of the bridge inside the music.youtube.com page: finds the
 * player, subscribes to media events, publishes state/track/health, and executes
 * commands coming from the host.
 */
export class BridgeController {
  private player: YtPlayerElement | null = null;
  private video: HTMLVideoElement | null = null;
  private lastTrackKey = '';
  private lastTrack: Track | null = null;
  private pendingVideoId: string | null = null;
  private pendingSince = 0;
  private lastTimeupdateAt = 0;
  private lastPlayingAt = 0;
  private healthStatus: 'ok' | 'degraded' | 'broken' = 'ok';
  private started = false;
  private lastQueueJson = '';
  private lastFlagsJson = '';
  private storeTimer = 0;
  private seenActions = new Set<string>();
  private audio = new AudioEngine();

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
        if (this.healthStatus === 'ok') {
          this.setHealth('broken', player ? 'video-element-missing' : 'player-element-missing');
          this.probe();
        }
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
    this.audio.setVideo(video);

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
      this.lastPlayingAt = now;
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

    // The question pauses the music. Answering it normally starts it again; if it does not, do so.
    watchIdlePrompt(() => {
      if (this.video?.paused && Date.now() - this.lastPlayingAt < IDLE_RESUME_WINDOW_MS)
        this.player?.playVideo?.();
    });
    this.subscribeStore();
    this.emitReady();
    this.emitTrack(true);
    this.emitState();
    this.emitQueue(true);
    this.emitFlags(true);
    this.probe();
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
      case 'volumeStep': {
        const current = p?.getVolume?.() ?? (v ? v.volume * 100 : 100);
        p?.setVolume?.(Math.round(clamp(current + cmd.delta * 100, 0, 100)));
        break;
      }
      case 'toggleMute':
        if (p?.isMuted?.() ?? v?.muted) p?.unMute?.();
        else p?.mute?.();
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
        // Before attach there is nothing truthful to report; attach() emits everything.
        if (!this.player) break;
        this.emitReady();
        this.emitTrack(true);
        this.emitState();
        this.probe();
        break;
      case 'data':
        void this.data(cmd.requestId, cmd.endpoint, cmd.body);
        break;
      case 'probe':
        this.probe();
        break;
      case 'endpoint':
        this.runEndpoint(cmd.endpoint, cmd.mode);
        break;
      case 'queueAdd':
        void this.queueAdd(cmd.target, cmd.position);
        break;
      case 'setShuffle': {
        const bar = getPlayerBar();
        if (bar && !!bar.shuffleOn !== cmd.enabled) bar.onShuffleButtonClick?.();
        break;
      }
      case 'setRepeat': {
        // The page cycles NONE → ALL → ONE; click until the requested mode is reached (max 3).
        const bar = getPlayerBar();
        for (let i = 0; i < 3 && bar && repeatFromPage(bar.repeatMode) !== cmd.mode; i += 1)
          bar.onRepeatButtonClick?.();
        break;
      }
      case 'queueSelect': {
        // The page's own selectQueueItem() wants an internal item id we cannot see. A queue item
        // carries the endpoint the website's own click would navigate to, so hand that back.
        const q = safeCall(() => getStore()?.getState()) as
          { queue?: { items?: unknown[]; automixItems?: unknown[] } } | undefined;
        const all = [...(q?.queue?.items ?? []), ...(q?.queue?.automixItems ?? [])];
        const endpoint = queueItemFromState(all[cmd.index], false)?.endpoint;
        if (endpoint) this.runEndpoint(endpoint, 'navigate');
        else log('warn', `queueSelect: no endpoint for item ${String(cmd.index)}`);
        break;
      }
      case 'queueRemove':
        getQueueApi()?.removeItem?.(cmd.index);
        break;
      case 'queueMove':
        getStore()?.dispatch({
          type: 'MOVE_ITEM',
          payload: { fromIndex: cmd.from, toIndex: cmd.to },
        });
        break;
      case 'setAutoplay':
        getStore()?.dispatch({ type: 'SET_AUTOPLAY', payload: cmd.enabled });
        break;
      case 'setPlaybackRate':
        p?.setPlaybackRate?.(cmd.rate);
        if (v) v.playbackRate = cmd.rate;
        break;
      case 'setVideoMode':
        getStore()?.dispatch({ type: 'SET_PLAYER_AUDIO_ONLY', payload: !cmd.video });
        // The video lives in the player page, which the page only lays out while it is open.
        if (cmd.video)
          getStore()?.dispatch({ type: 'SET_PLAYER_PAGE_INFO', payload: { open: true } });
        setVideoLayout(cmd.video);
        break;
      case 'setAudio':
        this.audio.apply(cmd.config);
        break;
    }
  }

  /**
   * Give an endpoint back to the page. Navigation endpoints go through the app's router (which
   * handles watch endpoints by starting playback with YouTube's own queue semantics); service
   * endpoints go through the app's registered handlers.
   */
  private runEndpoint(endpoint: Record<string, unknown>, mode: 'navigate' | 'service'): void {
    const app = getApp();
    if (!app) {
      log('error', 'endpoint: app missing');
      return;
    }
    if (mode === 'navigate') {
      // YouTube's own renderers fire `yt-navigate` with the raw endpoint JSON; the app's navigator
      // wraps it in its internal Endpoint class (navigator.navigate() wants that class, not JSON).
      log('debug', 'endpoint: yt-navigate event');
      app.dispatchEvent(
        new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint } }),
      );
      return;
    }
    log('debug', 'endpoint: yt-service-request event');
    app.dispatchEvent(
      new CustomEvent('yt-service-request', {
        bubbles: true,
        composed: true,
        detail: { endpoint },
      }),
    );
  }

  /**
   * "Play next" / "Add to queue": ask YouTube for the queue items it would build for the target
   * (the `next` endpoint), then insert them through the page's own store action, exactly as the
   * website's menu does. If the queue is empty, start playback instead.
   */
  private async queueAdd(
    target: {
      videoId?: string | undefined;
      playlistId?: string | undefined;
      params?: string | undefined;
    },
    position: 'next' | 'end',
  ): Promise<void> {
    const nm = getNetworkManager();
    const store = getStore();
    if (!nm || !store) {
      log('error', 'queueAdd: network manager or store missing');
      return;
    }
    const state = store.getState() as {
      queue?: { items?: unknown[]; selectedItemIndex?: number; nextQueueItemId?: number };
    };
    const current = state.queue?.items ?? [];
    if (current.length === 0) {
      this.runEndpoint(
        target.playlistId
          ? {
              watchPlaylistEndpoint: {
                playlistId: target.playlistId,
                ...(target.params ? { params: target.params } : {}),
              },
            }
          : {
              watchEndpoint: {
                videoId: target.videoId ?? '',
                ...(target.params ? { params: target.params } : {}),
              },
            },
        'navigate',
      );
      return;
    }
    try {
      const response = (await nm.fetch('/next', {
        ...(target.videoId ? { videoId: target.videoId } : {}),
        ...(target.playlistId ? { playlistId: target.playlistId } : {}),
        ...(target.params ? { params: target.params } : {}),
        enablePersistentPlaylistPanel: true,
        isAudioOnly: true,
        tunerSettingValue: 'AUTOMIX_SETTING_NORMAL',
      })) as Record<string, unknown>;
      const panel = pick(response, [
        'contents',
        'singleColumnMusicWatchNextResultsRenderer',
        'tabbedRenderer',
        'watchNextTabbedResultsRenderer',
        'tabs',
        0,
        'tabRenderer',
        'content',
        'musicQueueRenderer',
        'content',
        'playlistPanelRenderer',
      ]) as { contents?: unknown[] } | undefined;
      const items = (panel?.contents ?? []).filter((c) => {
        const w = c as Record<string, unknown>;
        return !!w.playlistPanelVideoRenderer || !!w.playlistPanelVideoWrapperRenderer;
      });
      // A single video's `next` response includes radio suggestions; keep just the target itself.
      const toInsert = target.playlistId ? items : items.slice(0, 1);
      if (!toInsert.length) {
        log('warn', 'queueAdd: no items in next response');
        return;
      }
      const selected = state.queue?.selectedItemIndex ?? 0;
      store.dispatch({
        type: 'ADD_ITEMS',
        payload: {
          nextQueueItemId: state.queue?.nextQueueItemId ?? 0,
          index: position === 'next' ? selected + 1 : current.length,
          items: toInsert,
          shuffleEnabled: false,
          shouldAssignIds: true,
        },
      });
      log('info', `queueAdd: inserted ${String(toInsert.length)} item(s) at ${position}`);
    } catch (err) {
      log('error', `queueAdd failed: ${String(err)}`);
    }
  }

  private subscribeStore(): void {
    const store = getStore();
    if (!store) {
      this.setHealth('degraded', 'store-missing');
      return;
    }
    store.subscribe(() => {
      if (this.storeTimer) return;
      this.storeTimer = window.setTimeout(() => {
        this.storeTimer = 0;
        this.emitQueue(false);
        this.emitFlags(false);
      }, 150);
    });
    // Dev aid: learn the page's own action vocabulary from what it dispatches.
    const original = store.dispatch.bind(store);
    store.dispatch = (action: unknown) => {
      const type = (action as { type?: unknown } | null)?.type;
      if (typeof type === 'string' && !this.seenActions.has(type)) {
        this.seenActions.add(type);
        log('debug', `redux action: ${type}`);
      }
      return original(action);
    };
  }

  private emitQueue(force: boolean): void {
    const state = safeCall(() => getStore()?.getState()) as
      { queue?: Record<string, unknown> } | undefined;
    const q = state?.queue;
    if (!q) return;
    const items = (Array.isArray(q.items) ? q.items : [])
      .map((it) => queueItemFromState(it, false))
      .filter((x): x is QueueItem => x !== null);
    const automix = (Array.isArray(q.automixItems) ? q.automixItems : [])
      .map((it) => queueItemFromState(it, true))
      .filter((x): x is QueueItem => x !== null);
    const queue: QueueState = {
      items: [...items, ...automix].slice(0, 5000),
      index: typeof q.selectedItemIndex === 'number' ? q.selectedItemIndex : -1,
      shuffle: q.shuffleEnabled === true,
      repeat: repeatFromPage(typeof q.repeatMode === 'string' ? q.repeatMode : undefined),
      autoplay: q.autoplay === true,
      title:
        safeCall(() =>
          readRuns(
            (q.header as Record<string, unknown> | undefined)?.musicQueueHeaderRenderer,
            'subtitle',
          ),
        ) ?? null,
    };
    const json = JSON.stringify(queue);
    if (!force && json === this.lastQueueJson) return;
    this.lastQueueJson = json;
    emit({ type: 'queue', queue });
  }

  private emitFlags(force: boolean): void {
    const state = safeCall(() => getStore()?.getState()) as
      { player?: Record<string, unknown>; likeStatus?: Record<string, unknown> } | undefined;
    if (!state) return;
    const videoId = this.player?.getVideoData?.()?.video_id;
    const likeRaw = videoId
      ? (state.likeStatus?.videos as Record<string, unknown> | undefined)?.[videoId]
      : undefined;
    const like =
      typeof likeRaw === 'string' ? likeRaw : (likeRaw as { status?: string } | undefined)?.status;
    const flags: PlayerFlags = {
      likeStatus: like === 'LIKE' || like === 'DISLIKE' || like === 'INDIFFERENT' ? like : null,
      playbackRate: clamp(
        typeof state.player?.playbackRate === 'number'
          ? state.player.playbackRate
          : (this.video?.playbackRate ?? 1),
        0.1,
        4,
      ),
      isVideo: state.player?.audioOnly === false,
      adPlaying: state.player?.adPlaying === true,
    };
    const json = JSON.stringify(flags);
    if (!force && json === this.lastFlagsJson) return;
    this.lastFlagsJson = json;
    emit({ type: 'flags', flags });
  }

  private async data(
    requestId: string,
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const nm = getNetworkManager();
    if (!nm) {
      this.setHealth('degraded', 'network-manager-missing');
      emit({ type: 'dataResponse', requestId, ok: false, error: 'network-manager-missing' });
      return;
    }
    let timer = 0;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => {
        reject(new Error('timeout'));
      }, DATA_TIMEOUT_MS);
    });
    try {
      const response = await Promise.race([nm.fetch(`/${endpoint}`, body), timeout]);
      emit({ type: 'dataResponse', requestId, ok: true, response });
    } catch (err) {
      emit({ type: 'dataResponse', requestId, ok: false, error: String(err).slice(0, 1024) });
    } finally {
      window.clearTimeout(timer);
    }
  }

  /** Feature-detect the page internals we rely on. Emitted on attach and on demand. */
  private probe(): void {
    const app = getApp();
    const playerBar = document.querySelector('ytmusic-player-bar');
    const queue = document.querySelector('ytmusic-player-queue');
    const found: Record<string, boolean> = {
      app: !!app,
      networkManager: !!getNetworkManager(),
      moviePlayer: !!this.player,
      video: !!this.video,
      playerBar: !!playerBar,
      queue: !!queue,
      mediaSession: 'mediaSession' in navigator,
    };
    const notes = [
      `url: ${location.href.slice(0, 300)}`,
      `title: ${document.title.slice(0, 200)}`,
      `readyState: ${document.readyState}`,
      `elements: ${[
        'ytmusic-app',
        'ytmusic-player',
        'ytmusic-player-bar',
        '#movie_player',
        'video',
        'ytmusic-nav-bar',
        'form',
        'iframe',
      ]
        .map((sel) => `${sel}=${String(document.querySelectorAll(sel).length)}`)
        .join(' ')}`,
      `body text: ${(document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 400)}`,
      `app methods: ${methodNames(app).join(',')}`,
      `app keys: ${keyNames(app).join(',')}`,
      `networkManager methods: ${methodNames(app?.networkManager).join(',')}`,
      `playerBar methods: ${methodNames(playerBar).join(',')}`,
      `playerBar keys: ${keyNames(playerBar).join(',')}`,
      `queue methods: ${methodNames(queue).join(',')}`,
      `queue keys: ${keyNames(queue).join(',')}`,
      `queue props: ${propNames(queue).join(',')}`,
      `playerBar props: ${propNames(playerBar).join(',')}`,
      `app props: ${propNames(app).join(',')}`,
      `app state keys: ${keyNames(safeCall(() => (app as unknown as { getState?: () => unknown }).getState?.())).join(',')}`,
      `app state.queue keys: ${keyNames(safeCall(() => (app as unknown as { getState?: () => { queue?: unknown } }).getState?.()?.queue)).join(',')}`,
      `app state.player keys: ${keyNames(safeCall(() => (app as unknown as { getState?: () => { player?: unknown } }).getState?.()?.player)).join(',')}`,
      `queue.queue keys: ${keyNames(safeCall(() => (queue as unknown as { queue?: unknown } | null)?.queue)).join(',')}`,
      `queue.queue methods: ${methodNames(safeCall(() => (queue as unknown as { queue?: unknown } | null)?.queue)).join(',')}`,
      `queue.queue.store keys: ${keyNames(safeCall(() => (queue as unknown as { queue?: { store?: unknown } } | null)?.queue?.store)).join(',')}`,
      `queue.queue.store methods: ${methodNames(safeCall(() => (queue as unknown as { queue?: { store?: unknown } } | null)?.queue?.store)).join(',')}`,
      `serviceEndpointHandlers: ${keyNames(app?.serviceEndpointHandlers).join(',')}`,
      `navigator methods: ${methodNames(app?.navigator).join(',')}`,
      `queue item sample: ${JSON.stringify(safeCall(() => (getStore()?.getState() as { queue?: { items?: unknown[] } }).queue?.items?.[0]))?.slice(0, 1500) ?? ''}`,
      `likeStatus state: ${JSON.stringify(safeCall(() => (getStore()?.getState() as { likeStatus?: unknown }).likeStatus))?.slice(0, 300) ?? ''}`,
    ];
    emit({ type: 'capabilities', found, notes });
  }

  // ---------------------------------------------------------------------------

  private emitReady(): void {
    emit({
      type: 'ready',
      bridgeVersion: __BRIDGE_VERSION__,
      protocolVersion: 1,
      loggedIn: isLoggedIn(),
    });
    this.audio.report();
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
    if (track?.videoId && track.videoId !== this.pendingVideoId) {
      this.pendingVideoId = track.videoId;
      this.pendingSince = Date.now();
    }
    // A new id with the last song's details is the page catching up: wait for the real ones.
    if (isStaleTrack(this.lastTrack, track, this.pendingSince, Date.now())) return;
    this.lastTrack = track;
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

function repeatFromPage(mode: string | undefined): RepeatMode {
  if (!mode) return 'off';
  if (/(^|_)ONE$/u.test(mode)) return 'one';
  if (/(^|_)ALL$/u.test(mode)) return 'all';
  return 'off';
}

function readRuns(obj: unknown, key: string): string | undefined {
  const runs = (obj as Record<string, { runs?: { text?: string }[] }> | undefined)?.[key]?.runs;
  return Array.isArray(runs) ? runs.map((r) => r.text ?? '').join('') : undefined;
}

/** Queue items in the store are renderer wrappers (playlistPanelVideoRenderer …). */
function queueItemFromState(raw: unknown, isAutomix: boolean): QueueItem | null {
  const wrapper = raw as Record<string, unknown>;
  const r = (wrapper.playlistPanelVideoRenderer ??
    (
      wrapper.playlistPanelVideoWrapperRenderer as
        { primaryRenderer?: { playlistPanelVideoRenderer?: unknown } } | undefined
    )?.primaryRenderer?.playlistPanelVideoRenderer) as Record<string, unknown> | undefined;
  if (!r) return null;
  const videoId = typeof r.videoId === 'string' ? r.videoId : undefined;
  const title = readRuns(r, 'title');
  if (!videoId || !title) return null;
  const byline = readRuns(r, 'longBylineText') ?? readRuns(r, 'shortBylineText') ?? '';
  const parts = byline.split(' • ');
  const thumbs = (
    (r.thumbnail as { thumbnails?: { url?: string; width?: number }[] } | undefined)?.thumbnails ??
    []
  ).filter((t) => typeof t.url === 'string' && t.url.startsWith('https://'));
  const best = thumbs.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  const length = readRuns(r, 'lengthText');
  const dur = length
    ? length
        .split(':')
        .map(Number)
        .reduce((a, b) => a * 60 + b, 0)
    : null;
  return {
    videoId,
    title: title.slice(0, 512),
    artist: (parts[0] ?? '').slice(0, 512),
    album: parts.length > 2 ? (parts[1] ?? '').slice(0, 512) : null,
    artworkUrl: best?.url?.slice(0, 2048) ?? null,
    durationSeconds: dur !== null && Number.isFinite(dur) ? dur : null,
    endpoint: (r.navigationEndpoint as Record<string, unknown> | undefined) ?? null,
    isAutomix,
  };
}

function pick(root: unknown, path: (string | number)[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

function safeCall<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
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
