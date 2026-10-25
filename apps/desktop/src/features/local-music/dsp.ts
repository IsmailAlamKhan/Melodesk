/**
 * The sound path of the local player: every audio element is routed through a Web Audio graph, so
 * the equalizer, loudness leveling and crossfade work on local songs on every system (the file is
 * the app's own, so the audio is never silenced the way the web player's streams are on WebKit), and
 * an analyser gives the visuals the real spectrum.
 *
 *   element → per-song gain (loudness) → fade gain → bus → preamp → 10 EQ bands → analyser → output
 */
import { EQ_BAND_HZ } from '@melodesk/bridge/protocol';

/**
 * How much to scale a song by to bring it to a common loudness, from its ReplayGain value (dB), kept
 * below the point where its loudest peak would clip. 1 when the file carries no loudness data.
 */
export function replayGainFactor(gainDb: number | null, peak: number | null): number {
  if (gainDb === null || !Number.isFinite(gainDb)) return 1;
  const factor = Math.pow(10, gainDb / 20);
  if (peak !== null && peak > 0 && factor * peak > 1) return 1 / peak;
  return factor;
}

export const dbToGain = (db: number): number => Math.pow(10, db / 20);

export interface DeckNodes {
  /** Scales the song to the common loudness. */
  level: GainNode;
  /** The crossfade: 1 while it plays alone. */
  fade: GainNode;
}

export class AudioGraph {
  readonly analyser: AnalyserNode;
  private readonly bus: GainNode;
  private readonly preamp: GainNode;
  private readonly bands: BiquadFilterNode[];

  private constructor(readonly ctx: AudioContext) {
    this.bus = ctx.createGain();
    this.preamp = ctx.createGain();
    this.bands = EQ_BAND_HZ.map((hz, i) => {
      const filter = ctx.createBiquadFilter();
      filter.type = i === 0 ? 'lowshelf' : i === EQ_BAND_HZ.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = hz;
      filter.Q.value = 1;
      filter.gain.value = 0;
      return filter;
    });
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    let node: AudioNode = this.bus;
    for (const next of [this.preamp, ...this.bands, this.analyser]) {
      node.connect(next);
      node = next;
    }
    node.connect(ctx.destination);
  }

  /** A graph, or null where Web Audio is not there. */
  static create(): AudioGraph | null {
    try {
      // Older WebKit has the context only under a prefix.
      const Ctx =
        (
          window as unknown as {
            AudioContext?: typeof AudioContext;
            webkitAudioContext?: typeof AudioContext;
          }
        ).AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      return Ctx ? new AudioGraph(new Ctx()) : null;
    } catch {
      return null;
    }
  }

  /** Route an audio element through the graph. Each element can be attached once. */
  attach(audio: HTMLAudioElement): DeckNodes {
    const source = this.ctx.createMediaElementSource(audio);
    const level = this.ctx.createGain();
    const fade = this.ctx.createGain();
    source.connect(level);
    level.connect(fade);
    fade.connect(this.bus);
    return { level, fade };
  }

  setEq(enabled: boolean, preampDb: number, gainsDb: readonly number[]): void {
    const now = this.ctx.currentTime;
    this.preamp.gain.setTargetAtTime(enabled ? dbToGain(preampDb) : 1, now, 0.02);
    this.bands.forEach((band, i) => {
      band.gain.setTargetAtTime(enabled ? (gainsDb[i] ?? 0) : 0, now, 0.02);
    });
  }

  resume(): Promise<void> {
    return this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume();
  }

  /** Fade `node` to `to` over `seconds`, from where it is now. */
  fadeTo(node: GainNode, to: number, seconds: number): void {
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(to, now + Math.max(0.01, seconds));
  }

  setNow(node: GainNode, value: number): void {
    node.gain.cancelScheduledValues(this.ctx.currentTime);
    node.gain.setValueAtTime(value, this.ctx.currentTime);
  }
}
