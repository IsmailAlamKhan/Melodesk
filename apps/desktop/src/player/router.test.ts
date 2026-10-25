import type { PlayerCommand } from '@melodesk/bridge/protocol';
import { describe, expect, it } from 'vitest';
import { routeCommand } from './router';

const toggle: PlayerCommand = { type: 'toggle' };
const data: PlayerCommand = { type: 'data', requestId: 'r', endpoint: 'browse', body: {} };

describe('routeCommand', () => {
  it('sends everything to YouTube while a YouTube song is the one playing', () => {
    expect(routeCommand(toggle, 'youtube')).toBe('youtube');
    expect(routeCommand({ type: 'seek', seconds: 3 }, 'youtube')).toBe('youtube');
  });

  it('gives playback commands to the local player while a local song plays', () => {
    for (const c of [
      toggle,
      { type: 'next' },
      { type: 'seek', seconds: 12 },
      { type: 'setVolume', volume: 0.4 },
      { type: 'setShuffle', enabled: true },
      { type: 'queueSelect', index: 2 },
    ] satisfies PlayerCommand[])
      expect(routeCommand(c, 'local')).toBe('local');
  });

  it('keeps pages and account actions with YouTube even then', () => {
    expect(routeCommand(data, 'local')).toBe('youtube');
    expect(routeCommand({ type: 'requestState' }, 'local')).toBe('youtube');
    expect(routeCommand({ type: 'endpoint', endpoint: {}, mode: 'service' }, 'local')).toBe(
      'youtube',
    );
  });

  it('lets starting something on YouTube take over from the local player', () => {
    expect(routeCommand({ type: 'endpoint', endpoint: {}, mode: 'navigate' }, 'local')).toBe(
      'takeover',
    );
    expect(
      routeCommand({ type: 'queueAdd', target: { videoId: 'x' }, position: 'next' }, 'local'),
    ).toBe('takeover');
  });
});
