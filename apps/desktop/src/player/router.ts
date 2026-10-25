import type { PlayerCommand } from '@melodesk/bridge/protocol';
import type { PlaybackSource } from './store';

/**
 * Where a command goes. The UI has one player bar, one queue and one set of shortcuts, and sends
 * everything through `sendCommand`. Most of it is for the YouTube player; while a local song is the
 * one playing, the playback commands are for the local player instead.
 *
 * - `youtube`: the web player (also anything that is about the account, not about playback).
 * - `local`: the local player.
 * - `takeover`: for the web player, but it will start something, so the local player steps aside first.
 */
export type Route = 'youtube' | 'local' | 'takeover';

/** Commands a local song can answer (the rest is about YouTube: pages, accounts, video mode…). */
const LOCAL_COMMANDS = new Set<PlayerCommand['type']>([
  'play',
  'pause',
  'toggle',
  'next',
  'previous',
  'seek',
  'setVolume',
  'setMuted',
  'volumeStep',
  'toggleMute',
  'setShuffle',
  'setRepeat',
  'setPlaybackRate',
  'queueSelect',
  'queueRemove',
  'queueMove',
]);

export function routeCommand(command: PlayerCommand, source: PlaybackSource): Route {
  if (source !== 'local') return 'youtube';
  if (LOCAL_COMMANDS.has(command.type)) return 'local';
  if (command.type === 'queueAdd') return 'takeover';
  if (command.type === 'endpoint' && command.mode === 'navigate') return 'takeover';
  return 'youtube';
}

/** The local player, which registers itself while the local-music feature is on. */
export interface LocalPlayback {
  /** Carry out a playback command. */
  handle: (command: PlayerCommand) => void;
  /** Something from YouTube is about to start: stop the local song and give the screen back. */
  yieldToYouTube: () => void;
}

let local: LocalPlayback | null = null;

export function registerLocalPlayback(player: LocalPlayback): () => void {
  local = player;
  return () => {
    if (local === player) local = null;
  };
}

export function localPlayback(): LocalPlayback | null {
  return local;
}
