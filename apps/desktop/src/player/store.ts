import { create } from 'zustand';
import type {
  HealthStatus,
  PlaybackState,
  PlayerFlags,
  QueueState,
  Track,
  AudioStatus,
} from '@melodesk/bridge/protocol';

export interface PlayerStore {
  /** The bridge has attached to the player inside the webview. */
  ready: boolean;
  bridgeVersion: string | null;
  loggedIn: boolean;
  state: PlaybackState | null;
  track: Track | null;
  health: { status: HealthStatus; reason: string | null };
  /** Count of events rejected by schema validation; a steady climb means YouTube changed. */
  rejectedEvents: number;
  playerPath: string;
  playerVisible: boolean;
  capabilities: Record<string, boolean>;
  queue: QueueState | null;
  flags: PlayerFlags | null;
  audio: AudioStatus;
  /**
   * The id of the source that is playing (see `player/backends.ts`): `youtube` for the web player in
   * the hidden window, `local` for a file from the music folders, and so on. Empty until a source has
   * said it is playing. A source ignores what the others report while it is not the one playing.
   */
  source: string;
}

export const usePlayerStore = create<PlayerStore>(() => ({
  ready: false,
  bridgeVersion: null,
  loggedIn: false,
  state: null,
  track: null,
  health: { status: 'ok', reason: null },
  rejectedEvents: 0,
  playerPath: '/',
  playerVisible: false,
  capabilities: {},
  queue: null,
  flags: null,
  audio: { status: 'off', reason: null },
  source: '',
}));
