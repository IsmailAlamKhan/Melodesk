import { EQ_BAND_COUNT, EQ_BAND_HZ } from '../bands';
import type { AudioConfig, AudioStatus } from '../protocol';
import { emit, log } from './transport';

/**
 * Equalizer and volume leveling on the page's own <video> element, via Web Audio.
 *
 * Re-routing a media element into an AudioContext cannot be undone for that element, and a
 * context that is not running (or media the browser refuses to expose) turns playback into
 * silence. So the engine:
 *  - never touches the element until processing is asked for;
 *  - refuses protected (EME) media;
 *  - only re-routes once the context is verifiably running;
 *  - watches the signal after re-routing and, if audible playback goes silent, records that
 *    this machine cannot do it and reloads the player once, which restores the plain element.
 */

const TICK_MS = 250;
/** Continuous digital silence, while audibly playing, after which we assume the route is broken. */
const SILENCE_LIMIT_MS = 5000;
const RESUME_TIMEOUT_MS = 1500;
/** Leveling aims for this RMS and never moves more than this far from unity. */
const LEVEL_TARGET_DB = -16;
const LEVEL_MAX_CUT_DB = 9;
const LEVEL_MAX_BOOST_DB = 6;
const LEVEL_SMOOTHING = 0.08;
const AUDIBLE_FLOOR_DB = -50;
const DISABLED_KEY = 'melodesk-audio-disabled';
const MAX_BLOCKED_RETRIES = 3;

type Ctx = AudioContext;

interface Graph {
  ctx: Ctx;
  preamp: GainNode;
  filters: BiquadFilterNode[];
  level: GainNode;
  limiter: DynamicsCompressorNode;
  probe: AnalyserNode;
}

const dbToGain = (db: number): number => Math.pow(10, db / 20);

function neutral(c: AudioConfig): boolean {
  return !c.eq.enabled && !c.normalize;
}

/**
 * WebKit (WKWebView on macOS, WebKitGTK on Linux) hands a MediaElementAudioSourceNode digital
 * silence when the element plays through Media Source Extensions, which is how YouTube Music
 * streams. Measured on macOS: the context runs, an oscillator through the same analyser reads
 * full scale, the track advances, and the element's output is exactly zero. Chromium-based
 * WebView2 (Windows) does not have this problem.
 */
function webKitSilencesMediaSources(): boolean {
  // `vendor` is deprecated but still the one reliable WebKit-vs-Chromium signal (the UA is spoofed).
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return navigator.vendor.startsWith('Apple');
}

function storedDisabled(): boolean {
  try {
    return window.localStorage.getItem(DISABLED_KEY) === __BRIDGE_VERSION__;
  } catch {
    return false;
  }
}

function markDisabled(): void {
  try {
    window.localStorage.setItem(DISABLED_KEY, __BRIDGE_VERSION__);
  } catch {
    /* storage unavailable: the in-memory flag below still protects this session */
  }
}

export class AudioEngine {
  private config: AudioConfig | null = null;
  private video: HTMLVideoElement | null = null;
  private graph: Graph | null = null;
  private sources = new WeakMap<HTMLVideoElement, MediaElementAudioSourceNode>();
  private engaging = false;
  private blockedRetries = 0;
  private disabled = storedDisabled();
  private timer = 0;
  private silentMs = 0;
  private smoothedDb: number | null = null;
  private buf = new Float32Array(2048);
  private lastStatus = '';
  private loggedSignal = false;

  /** Called whenever the controller attaches to a (possibly new) video element. */
  setVideo(video: HTMLVideoElement): void {
    this.video = video;
    video.addEventListener('loadstart', () => {
      this.smoothedDb = null;
      this.silentMs = 0;
    });
    video.addEventListener('play', () => {
      const wanted = this.config && !neutral(this.config);
      if (wanted && !this.graph && !this.disabled) void this.engage();
      if (this.graph) void this.resume();
    });
    if (this.graph) this.route(video);
    else if (this.config && !neutral(this.config)) void this.engage();
  }

  apply(config: AudioConfig): void {
    this.config = config;
    if (this.graph) {
      this.updateParams();
      this.status(neutral(config) ? 'off' : 'active', null);
      return;
    }
    if (neutral(config)) {
      this.status('off', null);
      return;
    }
    if (this.disabled) {
      this.status('unavailable', 'disabled-after-failure');
      return;
    }
    this.blockedRetries = 0;
    void this.engage();
  }

  /** Re-announce the current status (after the UI reconnects). */
  report(): void {
    this.lastStatus = '';
    if (this.disabled) this.status('unavailable', 'disabled-after-failure');
    else if (this.config) this.status(neutral(this.config) ? 'off' : 'active', null);
  }

  // ---------------------------------------------------------------------------

  private status(status: AudioStatus['status'], reason: string | null): void {
    const key = `${status}:${reason ?? ''}`;
    if (key === this.lastStatus) return;
    this.lastStatus = key;
    emit({ type: 'audio', audio: { status, reason } });
  }

  private async resume(): Promise<boolean> {
    const ctx = this.graph?.ctx;
    if (!ctx) return false;
    if (ctx.state === 'running') return true;
    await Promise.race([
      ctx.resume().catch(() => undefined),
      new Promise((r) => window.setTimeout(r, RESUME_TIMEOUT_MS)),
    ]);
    return (ctx.state as string) === 'running';
  }

  /** Build the graph and re-route the element, only if everything checks out first. */
  private async engage(): Promise<void> {
    const video = this.video;
    if (this.engaging || this.graph || !video) return;
    if (webKitSilencesMediaSources()) {
      this.status('unavailable', 'webkit-media-source');
      return;
    }
    if (video.mediaKeys) {
      this.status('unavailable', 'protected-media');
      return;
    }
    this.engaging = true;
    let ctx: Ctx | null = null;
    try {
      ctx = new AudioContext({ latencyHint: 'playback' });
      await Promise.race([
        ctx.resume().catch(() => undefined),
        new Promise((r) => window.setTimeout(r, RESUME_TIMEOUT_MS)),
      ]);
      if ((ctx.state as string) !== 'running') {
        // Not allowed to run yet (autoplay policy). Nothing has been re-routed, so nothing is lost.
        void ctx.close().catch(() => undefined);
        ctx = null;
        this.blockedRetries += 1;
        this.status('unavailable', 'audio-context-blocked');
        log('warn', `audio: context not running (attempt ${String(this.blockedRetries)})`);
        if (this.blockedRetries < MAX_BLOCKED_RETRIES) {
          window.setTimeout(() => {
            if (this.config && !neutral(this.config)) void this.engage();
          }, 2000);
        }
        return;
      }
      this.graph = this.build(ctx);
      this.route(video);
      this.updateParams();
      this.silentMs = 0;
      this.loggedSignal = false;
      this.timer = window.setInterval(() => {
        this.tick();
      }, TICK_MS);
      this.status(this.config && !neutral(this.config) ? 'active' : 'off', null);
      log('info', `audio: engaged (${String(ctx.sampleRate)} Hz, ${ctx.state})`);
    } catch (err) {
      log('error', `audio: engage failed: ${String(err)}`);
      this.graph = null;
      if (ctx) void ctx.close().catch(() => undefined);
      this.status('unavailable', 'engage-failed');
    } finally {
      this.engaging = false;
    }
  }

  private build(ctx: Ctx): Graph {
    const preamp = ctx.createGain();
    const filters = EQ_BAND_HZ.map((hz, i) => {
      const f = ctx.createBiquadFilter();
      f.type = i === 0 ? 'lowshelf' : i === EQ_BAND_COUNT - 1 ? 'highshelf' : 'peaking';
      f.frequency.value = hz;
      f.Q.value = 1.0;
      f.gain.value = 0;
      return f;
    });
    const level = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = 0;
    limiter.ratio.value = 1;
    const probe = ctx.createAnalyser();
    probe.fftSize = 2048;

    let prev: AudioNode = preamp;
    for (const f of filters) {
      prev.connect(f);
      prev = f;
    }
    prev.connect(level);
    level.connect(limiter);
    limiter.connect(ctx.destination);
    // The probe only listens; a muted sink keeps it in the pulled part of the graph.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    probe.connect(sink);
    sink.connect(ctx.destination);
    return { ctx, preamp, filters, level, limiter, probe };
  }

  /** Point the (single) media element source at the processing chain. */
  private route(video: HTMLVideoElement): void {
    const g = this.graph;
    if (!g) return;
    let src = this.sources.get(video);
    if (!src) {
      src = g.ctx.createMediaElementSource(video);
      this.sources.set(video, src);
    }
    src.disconnect();
    src.connect(g.preamp);
    src.connect(g.probe);
  }

  private updateParams(): void {
    const g = this.graph;
    const c = this.config;
    if (!g || !c) return;
    const t = g.ctx.currentTime;
    const gains = c.eq.enabled ? c.eq.gainsDb : new Array<number>(EQ_BAND_COUNT).fill(0);
    // Automatic headroom: cut by as much as the largest boost so a boosted band cannot clip.
    const headroom = c.eq.enabled ? Math.max(0, ...gains) : 0;
    const pre = c.eq.enabled ? c.eq.preampDb - headroom : 0;
    g.preamp.gain.setTargetAtTime(dbToGain(pre), t, 0.02);
    g.filters.forEach((f, i) => {
      f.gain.setTargetAtTime(gains[i] ?? 0, t, 0.02);
    });
    // Limiter: transparent unless leveling or EQ is on.
    const on = !neutral(c);
    g.limiter.threshold.setTargetAtTime(on ? -2 : 0, t, 0.02);
    g.limiter.knee.setTargetAtTime(on ? 3 : 0, t, 0.02);
    g.limiter.ratio.setTargetAtTime(on ? 20 : 1, t, 0.02);
    g.limiter.attack.setTargetAtTime(0.003, t, 0.02);
    g.limiter.release.setTargetAtTime(0.1, t, 0.02);
    if (!c.normalize) g.level.gain.setTargetAtTime(1, t, 0.3);
  }

  private tick(): void {
    const g = this.graph;
    const v = this.video;
    if (!g || !v) return;
    if (g.ctx.state !== 'running') {
      void this.resume();
      return;
    }
    const audible = !v.paused && !v.ended && v.readyState >= 3 && !v.muted && v.volume > 0;
    if (!audible) {
      this.silentMs = 0;
      return;
    }
    g.probe.getFloatTimeDomainData(this.buf);
    let peak = 0;
    let sumSq = 0;
    for (const x of this.buf) {
      const a = Math.abs(x);
      if (a > peak) peak = a;
      sumSq += x * x;
    }
    const rmsDb = 20 * Math.log10(Math.sqrt(sumSq / this.buf.length) || 1e-9);

    if (peak > 0) {
      this.silentMs = 0;
      if (!this.loggedSignal) {
        this.loggedSignal = true;
        log(
          'info',
          `audio: signal ok (peak ${peak.toFixed(3)}, rms ${rmsDb.toFixed(1)} dB, volume ${v.volume.toFixed(2)})`,
        );
      }
    } else {
      this.silentMs += TICK_MS;
      if (this.silentMs >= SILENCE_LIMIT_MS) {
        this.recover();
        return;
      }
    }

    if (this.config?.normalize && rmsDb > AUDIBLE_FLOOR_DB) {
      this.smoothedDb =
        this.smoothedDb === null
          ? rmsDb
          : this.smoothedDb + (rmsDb - this.smoothedDb) * LEVEL_SMOOTHING;
      const gainDb = Math.min(
        LEVEL_MAX_BOOST_DB,
        Math.max(-LEVEL_MAX_CUT_DB, LEVEL_TARGET_DB - this.smoothedDb),
      );
      g.level.gain.setTargetAtTime(dbToGain(gainDb), g.ctx.currentTime, 1.0);
    }
  }

  /**
   * Audible playback produced digital silence after re-routing: the element cannot be processed
   * here. Remember that, and reload the player once so the plain element (and sound) comes back.
   */
  private recover(): void {
    window.clearInterval(this.timer);
    this.disabled = true;
    markDisabled();
    this.status('unavailable', 'silent-after-routing');
    log('error', 'audio: silence after routing; disabling processing and reloading the player');
    window.setTimeout(() => {
      window.location.reload();
    }, 300);
  }
}
