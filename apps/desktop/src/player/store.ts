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
   * Whose song is playing. `youtube` is the web player in the hidden window; `local` is a file from
   * the music folders, played by the local player (features/local-music). While it is `local` the
   * web player's track, state, queue and flags events are ignored.
   */
  source: PlaybackSource;
}

export type PlaybackSource = 'youtube' | 'local';

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
  source: 'youtube',
}));
