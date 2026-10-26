import type { PlayerCommand } from '@melodesk/bridge/protocol';
import { registerBackend, type PlaybackBackend } from '../../player/backends';

/** The id your own music has as a playback source. */
export const SOURCE_ID = 'local';

/** What a local song answers: playback and the queue. Pages and accounts are for other sources. */
const COMMANDS = new Set<PlayerCommand['type']>([
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

export const localDescriptor: PlaybackBackend = {
  id: SOURCE_ID,
  feature: 'local-music',
  handles: (command) => COMMANDS.has(command.type),
};

// Known in every window (the mini player has to know that a local song answers these), whether or not
// the player itself runs there; the main window adds `send` when the player starts.
registerBackend(localDescriptor);
