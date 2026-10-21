/**
 * Plugin SDK: what a plugin receives from the host. Capabilities are handed over only for
 * permissions the manifest declares (the host passes `undefined` otherwise), so a plugin
 * cannot reach a capability it did not ask for. Everything is typed; no `any`.
 */
import type { PluginManifest, PluginManifestInput, PluginPermission } from './manifest';

export interface PluginTrack {
  videoId: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  durationSeconds: number | null;
}

export interface PluginPlaybackState {
  playing: boolean;
  positionSeconds: number;
  durationSeconds: number;
}

export interface PlayerReadApi {
  current(): { track: PluginTrack | null; state: PluginPlaybackState | null };
  onTrackChange(cb: (track: PluginTrack | null) => void): () => void;
  onStateChange(cb: (state: PluginPlaybackState) => void): () => void;
}

export interface PlayerControlApi {
  play(): Promise<void>;
  pause(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seek(seconds: number): Promise<void>;
}

/** Only hosts listed in the manifest's `hosts` are reachable; others reject. */
export type FetchApi = (
  url: string,
  init?: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export interface StorageApi {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Open an https link in the user's own browser. Only hosts in the manifest's `linkHosts` work. */
export type OpenLinkApi = (url: string) => Promise<void>;

export type NotifyApi = (title: string, body?: string) => void;

export interface NativeApi {
  /** Call an allow-listed host command (e.g. Discord presence). */
  invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export interface PluginSettingField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'boolean' | 'number' | 'select';
  hint?: string;
  options?: { value: string; label: string }[];
  default?: string | number | boolean;
}

export interface LyricsLine {
  startMs: number;
  endMs: number;
  text: string;
}

export interface LyricsResult {
  text: string | null;
  synced: LyricsLine[] | null;
  source: string;
}

export interface PluginContext {
  manifest: PluginManifest;
  player?: PlayerReadApi;
  control?: PlayerControlApi;
  fetch?: FetchApi;
  storage?: StorageApi;
  notify?: NotifyApi;
  openLink?: OpenLinkApi;
  native?: NativeApi;
  /** Current values of the plugin's own settings fields. */
  settings: Record<string, string | number | boolean>;
  onSettingsChange(cb: (settings: Record<string, string | number | boolean>) => void): () => void;
  log(level: 'info' | 'warn' | 'error', message: string): void;
}

export interface PluginInstance {
  /** Optional: provide lyrics when YouTube has none (lyrics fallback plugins). */
  lyricsProvider?: (track: PluginTrack) => Promise<LyricsResult | null>;
  /** Optional: a user-facing action shown in the plugin's settings card. */
  actions?: { label: string; run: () => Promise<void> }[];
  /** Optional: status line for the settings card. */
  status?: () => string;
  dispose?: () => void;
}

export interface PluginDefinition {
  manifest: PluginManifestInput;
  settingsFields?: PluginSettingField[];
  setup: (ctx: PluginContext) => PluginInstance | Promise<PluginInstance>;
}

export function definePlugin(def: PluginDefinition): PluginDefinition {
  return def;
}

export function hasPermission(manifest: PluginManifest, permission: PluginPermission): boolean {
  return manifest.permissions.includes(permission);
}
