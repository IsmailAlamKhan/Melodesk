import type { PlayerCommand } from '@melodesk/bridge/protocol';
import { describe, expect, it } from 'vitest';
import { resolveRoute, type PlaybackBackend } from './backends';

const toggle: PlayerCommand = { type: 'toggle' };
const data: PlayerCommand = { type: 'data', requestId: 'r', endpoint: 'browse', body: {} };

/** A web player that answers everything and starts things from pages, and a local one for a few commands. */
const web: PlaybackBackend = {
  id: 'web',
  fallback: true,
  handles: () => true,
  starts: (c) => c.type === 'queueAdd' || (c.type === 'endpoint' && c.mode === 'navigate'),
};
const own: PlaybackBackend = {
  id: 'own',
  handles: (c) =>
    ['toggle', 'next', 'seek', 'setVolume', 'setShuffle', 'queueSelect'].includes(c.type),
};
const all = [web, own];
const go = (c: PlayerCommand, active: string) => resolveRoute(c, active, all);

describe('resolveRoute', () => {
  it('sends everything to the fallback while nothing is playing, or it is the one playing', () => {
    expect(go(toggle, '')).toEqual({ to: 'web', yieldFrom: null });
    expect(go(toggle, 'web')).toEqual({ to: 'web', yieldFrom: null });
    expect(go({ type: 'seek', seconds: 3 }, 'web')).toEqual({ to: 'web', yieldFrom: null });
  });

  it('gives playback commands to the source that is playing', () => {
    for (const c of [
      toggle,
      { type: 'next' },
      { type: 'seek', seconds: 12 },
      { type: 'setVolume', volume: 0.4 },
      { type: 'setShuffle', enabled: true },
      { type: 'queueSelect', index: 2 },
    ] satisfies PlayerCommand[])
      expect(go(c, 'own')).toEqual({ to: 'own', yieldFrom: null });
  });

  it('keeps what the playing source cannot answer with whoever can, without stopping it', () => {
    expect(go(data, 'own')).toEqual({ to: 'web', yieldFrom: null });
    expect(go({ type: 'requestState' }, 'own')).toEqual({ to: 'web', yieldFrom: null });
    expect(go({ type: 'endpoint', endpoint: {}, mode: 'service' }, 'own')).toEqual({
      to: 'web',
      yieldFrom: null,
    });
  });

  it('lets starting something elsewhere take over from the playing source', () => {
    expect(go({ type: 'endpoint', endpoint: {}, mode: 'navigate' }, 'own')).toEqual({
      to: 'web',
      yieldFrom: 'own',
    });
    expect(go({ type: 'queueAdd', target: { videoId: 'x' }, position: 'next' }, 'own')).toEqual({
      to: 'web',
      yieldFrom: 'own',
    });
  });

  it('has nowhere to send a command nobody answers', () => {
    expect(resolveRoute(toggle, 'own', [own])).toEqual({ to: 'own', yieldFrom: null });
    expect(resolveRoute(data, 'own', [own])).toBeNull();
    expect(resolveRoute(toggle, '', [])).toBeNull();
  });
});
