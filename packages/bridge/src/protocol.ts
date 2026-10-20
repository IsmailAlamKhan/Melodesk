/**
 * The bridge protocol: everything that crosses the boundary between the
 * music.youtube.com webview and our own UI.
 *
 * Direction 1 — UI → player (PlayerCommand): validated by serde in Rust before it is
 * evaluated inside the player webview.
 * Direction 2 — player → UI (BridgeEvent): produced by the injected script, forwarded
 * by Rust untouched, and validated here with Zod before it reaches application state.
 *
 * Everything that arrives from the webview is untrusted data. Never widen these schemas
 * with `z.any()` / passthrough.
 */
import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Commands (UI → player)
// ---------------------------------------------------------------------------

export const PlayerCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play') }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('toggle') }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('previous') }),
  z.object({ type: z.literal('seek'), seconds: z.number().min(0) }),
  /** 0..1 */
  z.object({ type: z.literal('setVolume'), volume: z.number().min(0).max(1) }),
  z.object({ type: z.literal('setMuted'), muted: z.boolean() }),
  /** Navigate the player webview within music.youtube.com. Path must be absolute ("/explore"). */
  z.object({ type: z.literal('navigate'), path: z.string().regex(/^\/[^\s]*$/) }),
  /** Ask the bridge to re-emit `ready`, `state` and `track`. */
  z.object({ type: z.literal('requestState') }),
]);
export type PlayerCommand = z.infer<typeof PlayerCommandSchema>;

// ---------------------------------------------------------------------------
// Events (player → UI)
// ---------------------------------------------------------------------------

const httpsUrl = z
  .string()
  .max(2048)
  .refine((s) => s.startsWith('https://'), 'artwork must be https');

export const TrackSchema = z.object({
  videoId: z.string().max(64).nullable(),
  title: z.string().max(512),
  artist: z.string().max(512),
  album: z.string().max(512).nullable(),
  artworkUrl: httpsUrl.nullable(),
});
export type Track = z.infer<typeof TrackSchema>;

export const RepeatModeSchema = z.enum(['off', 'all', 'one']);
export type RepeatMode = z.infer<typeof RepeatModeSchema>;

export const PlaybackStateSchema = z.object({
  playing: z.boolean(),
  /** seconds */
  position: z.number().min(0),
  /** seconds; 0 when unknown */
  duration: z.number().min(0),
  /** 0..1 */
  volume: z.number().min(0).max(1),
  muted: z.boolean(),
  /** Unix ms when the bridge sampled this state; lets the UI interpolate position. */
  sampledAt: z.number().int().nonnegative(),
});
export type PlaybackState = z.infer<typeof PlaybackStateSchema>;

export const HealthStatusSchema = z.enum(['ok', 'degraded', 'broken']);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const BridgeEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    bridgeVersion: z.string().max(32),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    loggedIn: z.boolean(),
  }),
  z.object({ type: z.literal('state'), state: PlaybackStateSchema }),
  z.object({ type: z.literal('track'), track: TrackSchema.nullable() }),
  z.object({
    type: z.literal('health'),
    status: HealthStatusSchema,
    /** Machine-readable reason, e.g. "player-element-missing". */
    reason: z.string().max(128).nullable(),
  }),
  z.object({ type: z.literal('navigation'), path: z.string().max(2048) }),
  z.object({
    type: z.literal('log'),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    message: z.string().max(4096),
  }),
]);
export type BridgeEvent = z.infer<typeof BridgeEventSchema>;

/** Name of the Tauri event the Rust side re-emits bridge events on. */
export const BRIDGE_EVENT_CHANNEL = 'player:event' as const;
