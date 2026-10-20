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

export const RepeatModeSchema = z.enum(['off', 'all', 'one']);
export type RepeatMode = z.infer<typeof RepeatModeSchema>;

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
  z.object({ type: z.literal('volumeStep'), delta: z.number().min(-1).max(1) }),
  z.object({ type: z.literal('toggleMute') }),
  /** Navigate the player webview within music.youtube.com. Path must be absolute ("/explore"). */
  z.object({ type: z.literal('navigate'), path: z.string().regex(/^\/[^\s]*$/) }),
  /** Ask the bridge to re-emit `ready`, `state` and `track`. */
  z.object({ type: z.literal('requestState') }),
  /**
   * Perform an InnerTube request *through the page's own network layer*, so the page attaches
   * its own auth and context. The bridge never sees cookies or tokens. `endpoint` is the path
   * after `/youtubei/v1/`, e.g. "browse", "search", "next", "music/get_search_suggestions".
   */
  z.object({
    type: z.literal('data'),
    requestId: z.string().min(1).max(64),
    endpoint: z.string().regex(/^[a-z_]+(\/[a-z_]+)?$/u),
    body: z.record(z.string(), z.unknown()),
  }),
  /** Dev aid: report which internal page APIs exist (also feeds the health check). */
  z.object({ type: z.literal('probe') }),
  /**
   * Hand an InnerTube endpoint back to the page: a watch/watchPlaylist endpoint starts playback
   * through YouTube's own queue logic; a service endpoint (queueAdd, like, subscribe…) runs the
   * page's own handler so toasts, library state and the queue update exactly as on the website.
   */
  z.object({
    type: z.literal('endpoint'),
    endpoint: z.record(z.string(), z.unknown()),
    mode: z.enum(['navigate', 'service']),
  }),
  /** Play next / add to queue, implemented with the page's own queue store so it behaves like the website. */
  z.object({
    type: z.literal('queueAdd'),
    target: z.object({
      videoId: z.string().max(64).optional(),
      playlistId: z.string().max(128).optional(),
      params: z.string().max(256).optional(),
    }),
    position: z.enum(['next', 'end']),
  }),
  z.object({ type: z.literal('setShuffle'), enabled: z.boolean() }),
  z.object({ type: z.literal('setRepeat'), mode: RepeatModeSchema }),
  z.object({ type: z.literal('queueSelect'), index: z.number().int().min(0) }),
  z.object({ type: z.literal('queueRemove'), index: z.number().int().min(0) }),
  z.object({
    type: z.literal('queueMove'),
    from: z.number().int().min(0),
    to: z.number().int().min(0),
  }),
  z.object({ type: z.literal('setAutoplay'), enabled: z.boolean() }),
  z.object({ type: z.literal('setPlaybackRate'), rate: z.number().min(0.25).max(3) }),
  /** Toggle between the song and the music video version of the current item. */
  z.object({ type: z.literal('setVideoMode'), video: z.boolean() }),
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

export const QueueItemSchema = z.object({
  videoId: z.string().max(64),
  title: z.string().max(512),
  artist: z.string().max(512),
  album: z.string().max(512).nullable(),
  artworkUrl: httpsUrl.nullable(),
  durationSeconds: z.number().min(0).nullable(),
  /** Raw navigation endpoint to replay this exact item (same-playlist context). */
  endpoint: z.record(z.string(), z.unknown()).nullable(),
  /** Whether this item is one of YouTube's autoplay suggestions rather than the user's queue. */
  isAutomix: z.boolean(),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const QueueStateSchema = z.object({
  items: z.array(QueueItemSchema).max(5000),
  index: z.number().int().min(-1),
  shuffle: z.boolean(),
  repeat: RepeatModeSchema,
  autoplay: z.boolean(),
  /** "Playing from" header text, when YouTube shows one. */
  title: z.string().max(512).nullable(),
});
export type QueueState = z.infer<typeof QueueStateSchema>;

export const PlayerFlagsSchema = z.object({
  likeStatus: z.enum(['LIKE', 'DISLIKE', 'INDIFFERENT']).nullable(),
  playbackRate: z.number().min(0.1).max(4),
  /** The current item is playing as a music video (vs. audio-only song). */
  isVideo: z.boolean(),
  /** An ad is playing: controls should reflect that we cannot skip it. */
  adPlaying: z.boolean(),
});
export type PlayerFlags = z.infer<typeof PlayerFlagsSchema>;

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
  z.object({ type: z.literal('queue'), queue: QueueStateSchema }),
  z.object({ type: z.literal('flags'), flags: PlayerFlagsSchema }),
  z.object({
    type: z.literal('health'),
    status: HealthStatusSchema,
    /** Machine-readable reason, e.g. "player-element-missing". */
    reason: z.string().max(128).nullable(),
  }),
  z.object({ type: z.literal('navigation'), path: z.string().max(2048) }),
  z.object({
    type: z.literal('dataResponse'),
    requestId: z.string().min(1).max(64),
    ok: z.boolean(),
    /** Raw InnerTube JSON on success; parsed and validated by @melodesk/adapter. */
    response: z.unknown().optional(),
    error: z.string().max(1024).optional(),
  }),
  z.object({
    type: z.literal('capabilities'),
    /** Which page-internal APIs the bridge found. Drives the health banner and bug reports. */
    found: z.record(z.string().max(64), z.boolean()),
    /** Free-form discovery notes (method names etc.), dev builds only. */
    notes: z.array(z.string().max(512)).max(200).optional(),
  }),
  z.object({
    type: z.literal('log'),
    level: z.enum(['debug', 'info', 'warn', 'error']),
    message: z.string().max(4096),
  }),
]);
export type BridgeEvent = z.infer<typeof BridgeEventSchema>;

/** Name of the Tauri event the Rust side re-emits bridge events on. */
export const BRIDGE_EVENT_CHANNEL = 'player:event' as const;
