/**
 * The local player: plays the user's own files in an audio element of the main window, and shows
 * itself to the rest of the app the way the YouTube player does, by writing the same track, state,
 * queue and flags into the player store. The player bar, Now Playing, the queue panel, lyrics,
 * stats, the sleep timer and the keyboard shortcuts therefore work on it without knowing the
 * difference. `player/router.ts` sends the playback commands here while it is the active source.
 *
 * Two audio elements (decks) are used so the next song can be loaded ahead and started the moment
 * the current one ends (gapless) or fade in over it (crossfade). Both go through a Web Audio graph
 * (dsp.ts) for the equalizer, loudness leveling and the analyser the visuals read.
 *
 * One source plays at a time: starting a local song pauses the web player, and starting anything on
 * YouTube stops this one (`yieldToYouTube`).
 */
import type { PlayerCommand, QueueItem, QueueState, Track } from '@melodesk/bridge/protocol';
import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import { toast } from '../../app/toast';
import { useAudioPrefs } from '../../audio/store';
import { setLevelSource } from '../../core';
import { kvGet, kvSet } from '../../data/kv';
import { t } from '../../i18n';
import { registerLocalPlayback } from '../../player/router';
import { LOCAL_ID_PREFIX } from '../../player/sourceIds';
import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { getCover } from './covers';
import { AudioGraph, replayGainFactor, type DeckNodes } from './dsp';
import { createAnalyserSource } from './levels';
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
/** With no crossfade, the next song is started this long before the end (a gap of no more than a blink). */
const GAPLESS_LEAD_S = 0.03;
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
  interface Deck {
    audio: HTMLAudioElement;
    blobUrl: string | null;
    /** Which library song is loaded in it. */
    trackId: number | null;
    nodes: DeckNodes | null;
  }
  const newDeck = (): Deck => {
    const audio = new Audio();
    audio.preload = 'auto';
    return { audio, blobUrl: null, trackId: null, nodes: null };
  };
  const decks: [Deck, Deck] = [newDeck(), newDeck()];
  let cur = 0;
  const deckAt = (i: number): Deck => {
    const d = decks[i];
    if (!d) throw new Error('no such deck');
    return d;
  };
  const deck = (): Deck => deckAt(cur);
  const other = (): Deck => deckAt(1 - cur);
  const audio = (): HTMLAudioElement => deck().audio;
  const eachAudio = (fn: (a: HTMLAudioElement) => void): void => {
    for (const d of decks) fn(d.audio);
  };

  let graph: AudioGraph | null | undefined;
  let offLevels: (() => void) | null = null;
  let queue: Queue<LocalTrack> = emptyQueue();
  let loadToken = 0;
  let preloadToken = 0;
  let failures = 0;
  let lastState = 0;
  let wasPlaying = false;
  let rate = 1;
  let alive = true;
  /** A crossfade or hand-over is under way: nothing else starts one. */
  let crossing = false;
  let gaplessTimer = 0;
  let stopOldTimer = 0;

  const store = usePlayerStore;
  const active = (): boolean => store.getState().source === 'local';
  const current = (): LocalTrack | null => queue.items[queue.index] ?? null;
  const prefs = () => useAudioPrefs.getState();

  // --- the sound path -------------------------------------------------------------------------

  /** The loudness correction for a song, if leveling is on. */
  const levelFor = (track: LocalTrack | undefined): number =>
    prefs().normalize && track ? replayGainFactor(track.replayGainDb, track.replayPeak) : 1;

  const applySound = (): void => {
    if (!graph) return;
    const p = prefs();
    graph.setEq(p.eqEnabled, p.preampDb, p.gainsDb);
    for (const d of decks) {
      const track = queue.items.find((q) => q.id === d.trackId);
      if (d.nodes) graph.setNow(d.nodes.level, levelFor(track));
    }
  };

  /** The Web Audio graph, made on first use (after a click, as browsers insist). */
  const ensureGraph = (): AudioGraph | null => {
    if (graph !== undefined) return graph;
    graph = AudioGraph.create();
    if (graph) {
      try {
        for (const d of decks) d.nodes = graph.attach(d.audio);
        applySound();
        offLevels = setLevelSource(createAnalyserSource(graph));
      } catch {
        // An element that cannot be routed plays on its own, without the equalizer.
        graph = null;
      }
    }
    return graph;
  };

  // --- what the rest of the app sees ----------------------------------------------------------

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
    const a = audio();
    const playing = !a.paused && !a.ended;
    store.setState({
      state: {
        playing,
        position: a.currentTime,
        duration: Number.isFinite(a.duration) ? a.duration : 0,
        volume: a.volume,
        muted: a.muted,
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

  // --- taking over from, and giving back to, the YouTube player -------------------------------

  const activate = (): void => {
    if (active()) return;
    void sendCommand({ type: 'pause' }).catch(() => undefined);
    store.setState({ source: 'local' });
    void invoke('local_set_active', { active: true }).catch(() => undefined);
    if (graph && !offLevels) offLevels = setLevelSource(createAnalyserSource(graph));
  };

  /** Put a deck away: stopped, its file let go, its fade back to full. */
  const clearDeck = (d: Deck): void => {
    d.audio.pause();
    if (d.blobUrl) URL.revokeObjectURL(d.blobUrl);
    d.blobUrl = null;
    d.trackId = null;
    d.audio.removeAttribute('src');
    d.audio.load();
    if (graph && d.nodes) graph.setNow(d.nodes.fade, 1);
  };

  const cancelTimers = (): void => {
    window.clearTimeout(gaplessTimer);
    window.clearTimeout(stopOldTimer);
    gaplessTimer = 0;
    stopOldTimer = 0;
    crossing = false;
  };

  const deactivate = (): void => {
    loadToken += 1;
    preloadToken += 1;
    cancelTimers();
    for (const d of decks) clearDeck(d);
    queue = emptyQueue();
    wasPlaying = false;
    offLevels?.();
    offLevels = null;
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

  // --- playing --------------------------------------------------------------------------------

  const readFile = async (track: LocalTrack): Promise<Blob> => {
    const buffer = await invoke<ArrayBuffer>('local_read_file', { path: track.path });
    return new Blob([buffer], { type: mimeFor(track.path) ?? 'audio/mpeg' });
  };

  /** Load a song into a deck (nothing to do if it is already there). */
  const loadInto = async (d: Deck, track: LocalTrack): Promise<void> => {
    if (d.trackId === track.id && d.blobUrl) return;
    const blob = await readFile(track);
    if (d.blobUrl) URL.revokeObjectURL(d.blobUrl);
    d.blobUrl = URL.createObjectURL(blob);
    d.audio.src = d.blobUrl;
    d.trackId = track.id;
    d.audio.playbackRate = rate;
    if (graph && d.nodes) graph.setNow(d.nodes.level, levelFor(track));
  };

  /** Read the song after the current one into the idle deck, so it can start at once. */
  const preloadNext = (): void => {
    if (!alive || !active() || crossing) return;
    const next = nextIndex(queue);
    if (next === null || queue.repeat === 'one') return;
    const track = queue.items[next];
    const idle = other();
    if (!track || !canPlayFile(track.path) || idle.trackId === track.id) return;
    const token = ++preloadToken;
    void loadInto(idle, track)
      .then(() => {
        // Whatever happened meanwhile (a skip, a stop) decides whether it is still wanted.
        if (token !== preloadToken || crossing) clearDeck(idle);
      })
      .catch(() => {
        idle.trackId = null;
      });
  };

  const playIndex = async (index: number, fade = 0): Promise<void> => {
    const track = queue.items[index];
    if (!track) return;
    activate();
    window.clearTimeout(gaplessTimer);
    gaplessTimer = 0;
    queue = { ...queue, index };
    const token = ++loadToken;
    preloadToken += 1;
    publishQueue();
    publishTrack(track, null);
    void getCover(track.path).then((art) => {
      if (token === loadToken && alive) publishTrack(track, art);
    });
    try {
      if (!canPlayFile(track.path)) throw new Error('format');
      const g = ensureGraph();
      const from = deck();
      const to = other();
      // A song that is already loaded in the idle deck (read ahead) starts without waiting.
      if (to.trackId !== track.id) clearDeck(to);
      await loadInto(to, track);
      if (token !== loadToken) return;
      // Never wait long on this: where there is no sound device the context may not start at all.
      await Promise.race([
        g?.resume().catch(() => undefined),
        new Promise((resolve) => window.setTimeout(resolve, 400)),
      ]);
      to.audio.currentTime = 0;
      to.audio.volume = from.audio.volume;
      to.audio.muted = from.audio.muted;
      to.audio.playbackRate = rate;
      window.clearTimeout(stopOldTimer);
      const overlapping =
        !!g && fade > 0 && !from.audio.paused && !from.audio.ended && !!from.nodes;
      if (g && overlapping && to.nodes && from.nodes) {
        crossing = true;
        g.setNow(to.nodes.fade, 0);
        g.fadeTo(to.nodes.fade, 1, fade);
        g.fadeTo(from.nodes.fade, 0, fade);
        stopOldTimer = window.setTimeout(
          () => {
            clearDeck(from);
            crossing = false;
            preloadNext();
          },
          fade * 1000 + 80,
        );
      } else {
        crossing = false;
        clearDeck(from);
        if (g && to.nodes) g.setNow(to.nodes.fade, 1);
      }
      cur = 1 - cur;
      await to.audio.play();
      failures = 0;
      preloadNext();
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

  /** Near the end of a song: start the next one, fading over it or exactly at its end. */
  const maybeHandOver = (): void => {
    if (crossing || gaplessTimer || !active()) return;
    const next = nextIndex(queue);
    if (next === null || queue.repeat === 'one') return;
    const a = audio();
    if (!(a.duration > 0) || a.paused) return;
    const remaining = a.duration - a.currentTime;
    const fade = graph ? prefs().crossfadeSeconds : 0;
    const nextTrack = queue.items[next];
    if (fade > 0 && a.duration > fade * 2 + 1) {
      if (remaining <= fade) void playIndex(next, fade);
    } else if (other().trackId === nextTrack?.id && remaining < 1) {
      // Read ahead and ready: start it a hair before this one ends, so there is no silence.
      gaplessTimer = window.setTimeout(
        () => {
          gaplessTimer = 0;
          void playIndex(next);
        },
        Math.max(0, (remaining - GAPLESS_LEAD_S) * 1000),
      );
    }
  };

  const handle = (command: PlayerCommand): void => {
    const a = audio();
    switch (command.type) {
      case 'play':
        if (a.ended) a.currentTime = 0;
        void graph?.resume().catch(() => undefined);
        void a.play().catch(() => undefined);
        break;
      case 'pause':
        eachAudio((x) => {
          x.pause();
        });
        break;
      case 'toggle':
        if (a.paused) {
          if (a.ended) a.currentTime = 0;
          void graph?.resume().catch(() => undefined);
          void a.play().catch(() => undefined);
        } else
          eachAudio((x) => {
            x.pause();
          });
        break;
      case 'next':
        goNext();
        break;
      case 'previous': {
        const step = previousStep(queue, a.currentTime);
        if (step.type === 'go') void playIndex(step.index);
        else a.currentTime = 0;
        break;
      }
      case 'seek':
        a.currentTime = Math.min(command.seconds, a.duration || command.seconds);
        window.clearTimeout(gaplessTimer);
        gaplessTimer = 0;
        break;
      case 'setVolume':
        eachAudio((x) => {
          x.volume = command.volume;
          x.muted = false;
        });
        break;
      case 'setMuted':
        eachAudio((x) => {
          x.muted = command.muted;
        });
        break;
      case 'toggleMute': {
        const muted = !a.muted;
        eachAudio((x) => {
          x.muted = muted;
        });
        break;
      }
      case 'volumeStep': {
        const volume = Math.min(1, Math.max(0, a.volume + command.delta));
        eachAudio((x) => {
          x.volume = volume;
        });
        break;
      }
      case 'setShuffle':
        queue = setShuffle(queue, command.enabled);
        publishQueue();
        preloadNext();
        break;
      case 'setRepeat':
        queue = { ...queue, repeat: command.mode };
        publishQueue();
        preloadNext();
        break;
      case 'setPlaybackRate':
        rate = command.rate;
        eachAudio((x) => {
          x.playbackRate = rate;
        });
        publishQueue();
        break;
      case 'queueSelect':
        void playIndex(command.index);
        break;
      case 'queueMove':
        queue = moveItem(queue, command.from, command.to);
        publishQueue();
        preloadNext();
        break;
      case 'queueRemove': {
        const removed = removeItem(queue, command.index);
        queue = removed.queue;
        if (queue.items.length === 0) {
          eachAudio((x) => {
            x.pause();
          });
          publishQueue();
        } else if (removed.removedCurrent) void playIndex(queue.index);
        else {
          publishQueue();
          preloadNext();
        }
        break;
      }
      default:
        break;
    }
  };

  // --- the audio elements ---------------------------------------------------------------------

  const onTime = (): void => {
    const now = Date.now();
    if (now - lastState >= STATE_EVERY_MS) {
      lastState = now;
      publishState();
    }
    maybeHandOver();
  };
  const onState = (): void => {
    lastState = Date.now();
    publishState();
  };
  const onEnded = (): void => {
    if (queue.repeat === 'one') {
      audio().currentTime = 0;
      void audio()
        .play()
        .catch(() => undefined);
      return;
    }
    const next = nextIndex(queue);
    if (next !== null) void playIndex(next);
    else publishState();
  };
  const onVolume = (): void => {
    onState();
    void kvSet(VOLUME_KEY, String(audio().volume)).catch(() => undefined);
  };

  // Only the deck that is current speaks for the player; the other is fading out or waiting.
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
  const bound: [HTMLAudioElement, string, EventListener][] = [];
  for (const d of decks)
    for (const [name, fn] of listeners) {
      const wrapped: EventListener = (e) => {
        if (e.target === audio()) fn();
      };
      d.audio.addEventListener(name, wrapped);
      bound.push([d.audio, name, wrapped]);
    }

  void kvGet(VOLUME_KEY)
    .then((v) => {
      const n = Number(v);
      if (v !== null && Number.isFinite(n))
        eachAudio((x) => {
          x.volume = Math.min(1, Math.max(0, n));
        });
    })
    .catch(() => undefined);

  // Equalizer, leveling and crossfade settings: applied as they change.
  void useAudioPrefs.getState().load();
  const offPrefs = useAudioPrefs.subscribe(() => {
    applySound();
    preloadNext();
  });

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
      preloadNext();
      toast(where === 'next' ? t('toast.willPlayNext') : t('toast.addedToQueue'));
    },
    current,
    stop: () => {
      if (active()) deactivate();
    },
  };

  return () => {
    alive = false;
    for (const [target, name, fn] of bound) target.removeEventListener(name, fn);
    offPrefs();
    void offCommand.then((off) => {
      off();
    });
    unregister();
    if (active()) deactivate();
    offLevels?.();
    player = null;
  };
}
