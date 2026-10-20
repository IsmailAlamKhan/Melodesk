import { create } from 'zustand';
import type {
  HealthStatus,
  PlaybackState,
  PlayerFlags,
  QueueState,
  Track,
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
}));
