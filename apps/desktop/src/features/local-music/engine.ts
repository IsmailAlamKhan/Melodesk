/**
 * The local player: plays the user's own files in an audio element of the main window, and shows
 * itself to the rest of the app the way the YouTube player does, by writing the same track, state,
 * queue and flags into the player store. The player bar, Now Playing, the queue panel, lyrics,
 * stats, the sleep timer and the keyboard shortcuts therefore work on it without knowing the
 * difference. `player/router.ts` sends the playback commands here while it is the active source.
 *
 * One source plays at a time: starting a local song pauses the web player, and starting anything on
 * YouTube stops this one (`yieldToYouTube`).
 */
import type { PlayerCommand, QueueItem, QueueState, Track } from '@melodesk/bridge/protocol';
import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import { toast } from '../../app/toast';
import { kvGet, kvSet } from '../../data/kv';
import { t } from '../../i18n';
import { registerLocalPlayback } from '../../player/router';
import { LOCAL_ID_PREFIX } from '../../player/sourceIds';
import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { getCover } from './covers';
import type { LocalTrack } from './library';
import {
  addToQueue,
  emptyQueue,
  moveItem,
  nextIndex,
  previousStep,
  removeItem,
  setShuffle,
  startQueue,
  type Queue,
} from './queue';

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
};

export function mimeFor(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? null;
}

let probe: HTMLAudioElement | null = null;
/** Whether this system's webview can play the file (macOS cannot play Ogg or Opus, for one). */
export function canPlayFile(path: string): boolean {
  const mime = mimeFor(path);
  if (!mime) return false;
  probe ??= document.createElement('audio');
  return probe.canPlayType(mime) !== '';
}

const STATE_EVERY_MS = 250;
const VOLUME_KEY = 'local:volume';

const toQueueItem = (track: LocalTrack): QueueItem => ({
  videoId: `${LOCAL_ID_PREFIX}${String(track.id)}`,
  title: track.title,
  artist: track.artist,
  album: track.album,
  artworkUrl: null,
  durationSeconds: track.durationMs / 1000,
  endpoint: null,
  isAutomix: false,
});

export interface LocalPlayer {
  /** Replace the queue with `tracks` and start `start`. */
  play: (tracks: readonly LocalTrack[], start: number, opts?: { shuffle?: boolean }) => void;
  enqueue: (tracks: readonly LocalTrack[], where: 'next' | 'end') => void;
  current: () => LocalTrack | null;
  stop: () => void;
}

let player: LocalPlayer | null = null;
/** The running local player, or null while the feature is off. */
export const localPlayer = (): LocalPlayer | null => player;

export function startLocalPlayer(): () => void {
  const audio = new Audio();
  audio.preload = 'auto';
  let queue: Queue<LocalTrack> = emptyQueue();
  let blobUrl: string | null = null;
  let loadToken = 0;
  let failures = 0;
  let lastState = 0;
  let wasPlaying = false;
  let rate = 1;
  let alive = true;

  const store = usePlayerStore;
  const active = (): boolean => store.getState().source === 'local';
  const current = (): LocalTrack | null => queue.items[queue.index] ?? null;

  // --- what the rest of the app sees -------------------------------------------------------

  const flags = () => ({
    likeStatus: null,
    playbackRate: rate,
    isVideo: false,
    adPlaying: false,
  });

  const queueState = (): QueueState => ({
    items: queue.items.map(toQueueItem),
    index: queue.index,
    shuffle: queue.shuffle,
    repeat: queue.repeat,
    autoplay: false,
    title: t('local.queueTitle'),
  });

  /** The mini player is another window with its own store: it is sent what this one holds. */
  const mirror = (): void => {
    const s = store.getState();
    void emitTo('mini', 'local:snapshot', {
      source: s.source,
      track: s.track,
      state: s.state,
      queue: s.queue,
      flags: s.flags,
    }).catch(() => undefined);
  };

  const publishState = (): void => {
    const playing = !audio.paused && !audio.ended;
    store.setState({
      state: {
        playing,
        position: audio.currentTime,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
        volume: audio.volume,
        muted: audio.muted,
        sampledAt: Date.now(),
      },
    });
    if ('mediaSession' in navigator)
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    if (playing !== wasPlaying) {
      wasPlaying = playing;
      void invoke('local_report', { event: { type: 'state', state: { playing } } }).catch(
        () => undefined,
      );
    }
    mirror();
  };

  const publishQueue = (): void => {
    store.setState({ queue: queueState(), flags: flags() });
    mirror();
  };

  const setMediaSession = (track: LocalTrack, art: string | null): void => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album ?? '',
      artwork: art ? [{ src: art }] : [],
    });
  };

  const publishTrack = (track: LocalTrack, art: string | null): void => {
    const info: Track = {
      videoId: `${LOCAL_ID_PREFIX}${String(track.id)}`,
      title: track.title,
      artist: track.artist,
      album: track.album,
      artworkUrl: art,
    };
    store.setState({ track: info });
    setMediaSession(track, art);
    void invoke('local_report', {
      event: { type: 'track', track: { ...info, artworkUrl: null } },
    }).catch(() => undefined);
    mirror();
  };

  // --- taking over from, and giving back to, the YouTube player -----------------------------

  const activate = (): void => {
    if (active()) return;
    void sendCommand({ type: 'pause' }).catch(() => undefined);
    store.setState({ source: 'local' });
    void invoke('local_set_active', { active: true }).catch(() => undefined);
  };

  const release = (): void => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = null;
    audio.removeAttribute('src');
    audio.load();
  };

  const deactivate = (): void => {
    loadToken += 1;
    audio.pause();
    release();
    queue = emptyQueue();
    wasPlaying = false;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    }
    void invoke('local_set_active', { active: false }).catch(() => undefined);
    store.setState({ source: 'youtube', track: null, state: null, queue: null, flags: null });
    void emitTo('mini', 'local:snapshot', { source: 'youtube' }).catch(() => undefined);
    // The web player still knows what it was doing: ask it to say so again.
    void sendCommand({ type: 'requestState' }).catch(() => undefined);
  };

  // --- playing -----------------------------------------------------------------------------

  const readFile = async (track: LocalTrack): Promise<Blob> => {
    const buffer = await invoke<ArrayBuffer>('local_read_file', { path: track.path });
    return new Blob([buffer], { type: mimeFor(track.path) ?? 'audio/mpeg' });
  };

  const playIndex = async (index: number): Promise<void> => {
    const track = queue.items[index];
    if (!track) return;
    activate();
    queue = { ...queue, index };
    const token = ++loadToken;
    publishQueue();
    publishTrack(track, null);
    void getCover(track.path).then((art) => {
      if (token === loadToken && alive) publishTrack(track, art);
    });
    try {
      if (!canPlayFile(track.path)) throw new Error('format');
      const blob = await readFile(track);
      if (token !== loadToken) return;
      release();
      blobUrl = URL.createObjectURL(blob);
      audio.src = blobUrl;
      audio.playbackRate = rate;
      await audio.play();
      failures = 0;
    } catch (err) {
      if (token !== loadToken) return;
      failures += 1;
      const unsupported = err instanceof Error && err.message === 'format';
      toast(
        unsupported
          ? t('local.unsupported', { title: track.title })
          : t('local.cannotPlay', { title: track.title }),
      );
      // Skip on to the next, unless every song in a row has failed.
      const next = nextIndex(queue);
      if (next !== null && failures < queue.items.length) void playIndex(next);
      else publishState();
    }
  };

  const goNext = (): void => {
    const next = nextIndex(queue);
    if (next !== null) void playIndex(next);
    else if (queue.items.length > 0) void playIndex(0);
  };

  const handle = (command: PlayerCommand): void => {
    switch (command.type) {
      case 'play':
        if (audio.ended) audio.currentTime = 0;
        void audio.play().catch(() => undefined);
        break;
      case 'pause':
        audio.pause();
        break;
      case 'toggle':
        if (audio.paused) {
          if (audio.ended) audio.currentTime = 0;
          void audio.play().catch(() => undefined);
        } else audio.pause();
        break;
      case 'next':
        goNext();
        break;
      case 'previous': {
        const step = previousStep(queue, audio.currentTime);
        if (step.type === 'go') void playIndex(step.index);
        else audio.currentTime = 0;
        break;
      }
      case 'seek':
        audio.currentTime = Math.min(command.seconds, audio.duration || command.seconds);
        break;
      case 'setVolume':
        audio.volume = command.volume;
        audio.muted = false;
        break;
      case 'setMuted':
        audio.muted = command.muted;
        break;
      case 'toggleMute':
        audio.muted = !audio.muted;
        break;
      case 'volumeStep':
        audio.volume = Math.min(1, Math.max(0, audio.volume + command.delta));
        break;
      case 'setShuffle':
        queue = setShuffle(queue, command.enabled);
        publishQueue();
        break;
      case 'setRepeat':
        queue = { ...queue, repeat: command.mode };
        publishQueue();
        break;
      case 'setPlaybackRate':
        rate = command.rate;
        audio.playbackRate = rate;
        publishQueue();
        break;
      case 'queueSelect':
        void playIndex(command.index);
        break;
      case 'queueMove':
        queue = moveItem(queue, command.from, command.to);
        publishQueue();
        break;
      case 'queueRemove': {
        const removed = removeItem(queue, command.index);
        queue = removed.queue;
        if (queue.items.length === 0) {
          audio.pause();
          publishQueue();
        } else if (removed.removedCurrent) void playIndex(queue.index);
        else publishQueue();
        break;
      }
      default:
        break;
    }
  };

  // --- the audio element --------------------------------------------------------------------

  const onTime = (): void => {
    const now = Date.now();
    if (now - lastState >= STATE_EVERY_MS) {
      lastState = now;
      publishState();
    }
  };
  const onState = (): void => {
    lastState = Date.now();
    publishState();
  };
  const onEnded = (): void => {
    if (queue.repeat === 'one') {
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
      return;
    }
    const next = nextIndex(queue);
    if (next !== null) void playIndex(next);
    else publishState();
  };
  const onVolume = (): void => {
    onState();
    void kvSet(VOLUME_KEY, String(audio.volume)).catch(() => undefined);
  };

  const listeners: [string, () => void][] = [
    ['timeupdate', onTime],
    ['play', onState],
    ['pause', onState],
    ['seeked', onState],
    ['durationchange', onState],
    ['volumechange', onVolume],
    ['ended', onEnded],
    ['ratechange', onState],
  ];
  for (const [name, fn] of listeners) audio.addEventListener(name, fn);

  void kvGet(VOLUME_KEY)
    .then((v) => {
      const n = Number(v);
      if (v !== null && Number.isFinite(n)) audio.volume = Math.min(1, Math.max(0, n));
    })
    .catch(() => undefined);

  if ('mediaSession' in navigator) {
    const bind = (action: MediaSessionAction, fn: MediaSessionActionHandler): void => {
      try {
        navigator.mediaSession.setActionHandler(action, fn);
      } catch {
        /* not supported by this webview */
      }
    };
    // These only act while a local song is the one playing: the web player sets its own handlers
    // in its own window, and the system sends the key to whichever is playing.
    bind('play', () => {
      if (active()) handle({ type: 'play' });
    });
    bind('pause', () => {
      if (active()) handle({ type: 'pause' });
    });
    bind('previoustrack', () => {
      if (active()) handle({ type: 'previous' });
    });
    bind('nexttrack', () => {
      if (active()) handle({ type: 'next' });
    });
    bind('seekto', (d) => {
      if (active() && d.seekTime !== undefined) handle({ type: 'seek', seconds: d.seekTime });
    });
  }

  // Commands from the tray, global shortcuts and media keys (Rust), and from the mini player.
  const offCommand = listen<PlayerCommand>('local:command', (e) => {
    if (active()) handle(e.payload);
  });

  const unregister = registerLocalPlayback({
    handle,
    yieldToYouTube: deactivate,
  });

  player = {
    play: (tracks, start, opts) => {
      queue = startQueue(tracks, start, {
        shuffle: opts?.shuffle ?? queue.shuffle,
        repeat: queue.repeat,
      });
      failures = 0;
      void playIndex(queue.index);
    },
    enqueue: (tracks, where) => {
      if (!active() || queue.items.length === 0) {
        queue = startQueue(tracks, 0, { shuffle: queue.shuffle, repeat: queue.repeat });
        void playIndex(queue.index);
        return;
      }
      queue = addToQueue(queue, tracks, where);
      publishQueue();
      toast(where === 'next' ? t('toast.willPlayNext') : t('toast.addedToQueue'));
    },
    current,
    stop: () => {
      if (active()) deactivate();
    },
  };

  return () => {
    alive = false;
    for (const [name, fn] of listeners) audio.removeEventListener(name, fn);
    void offCommand.then((off) => {
      off();
    });
    unregister();
    if (active()) deactivate();
    player = null;
  };
}
