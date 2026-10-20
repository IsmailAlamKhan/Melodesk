import { create } from 'zustand';
import type { HealthStatus, PlaybackState, Track } from '@melodesk/bridge/protocol';

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
}));
