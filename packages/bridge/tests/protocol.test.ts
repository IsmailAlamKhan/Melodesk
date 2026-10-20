import { describe, expect, it } from 'vitest';
import { BridgeEventSchema, PlayerCommandSchema } from '../src/protocol';

describe('PlayerCommandSchema', () => {
  it('accepts well-formed commands', () => {
    expect(PlayerCommandSchema.parse({ type: 'play' })).toEqual({ type: 'play' });
    expect(PlayerCommandSchema.parse({ type: 'seek', seconds: 12.5 })).toEqual({
      type: 'seek',
      seconds: 12.5,
    });
    expect(PlayerCommandSchema.parse({ type: 'navigate', path: '/explore' }).type).toBe('navigate');
  });

  it('rejects out-of-range and off-origin input', () => {
    expect(PlayerCommandSchema.safeParse({ type: 'setVolume', volume: 1.5 }).success).toBe(false);
    expect(PlayerCommandSchema.safeParse({ type: 'seek', seconds: -1 }).success).toBe(false);
    expect(
      PlayerCommandSchema.safeParse({ type: 'navigate', path: 'https://evil.example' }).success,
    ).toBe(false);
    expect(PlayerCommandSchema.safeParse({ type: 'eval', code: '1' }).success).toBe(false);
  });
});

describe('BridgeEventSchema', () => {
  it('accepts a state event', () => {
    const ev = BridgeEventSchema.parse({
      type: 'state',
      state: { playing: true, position: 1, duration: 200, volume: 0.5, muted: false, sampledAt: 1 },
    });
    expect(ev.type).toBe('state');
  });

  it('rejects non-https artwork and unknown event types', () => {
    expect(
      BridgeEventSchema.safeParse({
        type: 'track',
        track: { videoId: 'x', title: 't', artist: 'a', album: null, artworkUrl: 'http://x/y.jpg' },
      }).success,
    ).toBe(false);
    expect(BridgeEventSchema.safeParse({ type: 'exec', code: 'x' }).success).toBe(false);
  });

  it('strips unknown keys (no passthrough of untrusted fields)', () => {
    const ev = BridgeEventSchema.parse({ type: 'navigation', path: '/x', extra: 1 });
    expect('extra' in ev).toBe(false);
  });
});
