/**
 * Plugin host: instantiates first-party plugins with exactly the capabilities their manifest
 * declares. Third-party code loading is deliberately not implemented yet (no dynamic imports,
 * no eval); the SDK and permission model are what a sandboxed loader would sit behind.
 */
import {
  PluginManifestSchema,
  firstPartyPlugins,
  type LyricsResult,
  type PluginContext,
  type PluginDefinition,
  type PluginInstance,
  type PluginManifest,
  type PluginPlaybackState,
  type PluginTrack,
} from '@melodesk/plugins';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { db } from '../data/persister';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';
import { toast } from '../app/toast';

type SettingsValues = Record<string, string | number | boolean>;

export interface PluginRecord {
  def: PluginDefinition;
  manifest: PluginManifest;
  enabled: boolean;
  settings: SettingsValues;
  instance: PluginInstance | null;
  status: string | null;
  error: string | null;
}

interface PluginHostState {
  plugins: PluginRecord[];
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  setSettings: (id: string, values: SettingsValues) => Promise<void>;
  refreshStatus: () => void;
}

const NATIVE_COMMANDS: Record<string, string[]> = {
  'native:discord': ['discord_set_activity', 'discord_clear'],
};

async function kvGet(key: string): Promise<string | null> {
  const rows = await (
    await db()
  ).select<{ value: string }[]>('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}
async function kvSet(key: string, value: string): Promise<void> {
  await (
    await db()
  ).execute(
    'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, value, Date.now()],
  );
}
async function kvDel(key: string): Promise<void> {
  await (await db()).execute('DELETE FROM settings WHERE key = $1', [key]);
}

function currentTrack(): PluginTrack | null {
  const t = usePlayerStore.getState().track;
  const st = usePlayerStore.getState().state;
  if (!t?.videoId) return null;
  return {
    videoId: t.videoId,
    title: t.title,
    artist: t.artist,
    album: t.album,
    artworkUrl: t.artworkUrl,
    durationSeconds: st?.duration ?? null,
  };
}
function currentState(): PluginPlaybackState | null {
  const st = usePlayerStore.getState().state;
  return st
    ? { playing: st.playing, positionSeconds: st.position, durationSeconds: st.duration }
    : null;
}

function buildContext(
  manifest: PluginManifest,
  settings: SettingsValues,
  listeners: Set<(s: SettingsValues) => void>,
): PluginContext {
  const has = (p: PluginManifest['permissions'][number]): boolean =>
    manifest.permissions.includes(p);
  const hosts = new Set(manifest.hosts);
  const ctx: PluginContext = {
    manifest,
    settings,
    onSettingsChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    log: (level, message) => {
      console[level === 'info' ? 'log' : level](`[plugin:${manifest.id}] ${message}`);
    },
  };
  if (has('playback:read')) {
    ctx.player = {
      current: () => ({ track: currentTrack(), state: currentState() }),
      onTrackChange: (cb) => {
        let last = usePlayerStore.getState().track?.videoId ?? null;
        return usePlayerStore.subscribe((s) => {
          const id = s.track?.videoId ?? null;
          if (id !== last) {
            last = id;
            cb(currentTrack());
          }
        });
      },
      onStateChange: (cb) => {
        let lastState = usePlayerStore.getState().state;
        return usePlayerStore.subscribe((s) => {
          if (s.state !== lastState) {
            lastState = s.state;
            const st = currentState();
            if (st) cb(st);
          }
        });
      },
    };
  }
  if (has('playback:control')) {
    ctx.control = {
      play: () => sendCommand({ type: 'play' }),
      pause: () => sendCommand({ type: 'pause' }),
      next: () => sendCommand({ type: 'next' }),
      previous: () => sendCommand({ type: 'previous' }),
      seek: (seconds) => sendCommand({ type: 'seek', seconds }),
    };
  }
  if (has('network:fetch')) {
    ctx.fetch = async (url, init) => {
      const u = new URL(url);
      if (u.protocol !== 'https:' || !hosts.has(u.hostname))
        throw new Error(`plugin ${manifest.id} may not fetch ${u.hostname}`);
      const res = await tauriFetch(url, {
        method: init?.method ?? 'GET',
        ...(init?.headers ? { headers: init.headers } : {}),
        ...(init?.body !== undefined ? { body: init.body } : {}),
      });
      return {
        ok: res.ok,
        status: res.status,
        text: () => res.text(),
        json: () => res.json() as Promise<unknown>,
      };
    };
  }
  if (has('storage:plugin')) {
    const prefix = `plugin:${manifest.id}:store:`;
    ctx.storage = {
      get: async <T>(key: string) => {
        const raw = await kvGet(prefix + key);
        return raw === null ? null : (JSON.parse(raw) as T);
      },
      set: (key, value) => kvSet(prefix + key, JSON.stringify(value)),
      remove: (key) => kvDel(prefix + key),
    };
  }
  if (has('notifications')) ctx.notify = (title, body) => toast(body ? `${title}: ${body}` : title);
  const native = manifest.permissions.flatMap((p) => NATIVE_COMMANDS[p] ?? []);
  if (native.length) {
    ctx.native = {
      invoke: async <T>(command: string, args?: Record<string, unknown>) => {
        if (!native.includes(command))
          throw new Error(`plugin ${manifest.id} may not call ${command}`);
        return invoke<T>(command, args);
      },
    };
  }
  return ctx;
}

const listenerSets = new Map<string, Set<(s: SettingsValues) => void>>();

async function instantiate(rec: PluginRecord): Promise<PluginInstance> {
  const listeners = listenerSets.get(rec.manifest.id) ?? new Set<(s: SettingsValues) => void>();
  listenerSets.set(rec.manifest.id, listeners);
  const ctx = buildContext(rec.manifest, rec.settings, listeners);
  return rec.def.setup(ctx);
}

export const usePluginHost = create<PluginHostState>((set, get) => ({
  plugins: [],
  setEnabled: async (id, enabled) => {
    const rec = get().plugins.find((p) => p.manifest.id === id);
    if (!rec) return;
    await kvSet(`plugin:${id}:enabled`, enabled ? '1' : '0');
    if (!enabled) {
      rec.instance?.dispose?.();
      set((s) => ({
        plugins: s.plugins.map((p) =>
          p.manifest.id === id
            ? { ...p, enabled: false, instance: null, status: null, error: null }
            : p,
        ),
      }));
      return;
    }
    try {
      const instance = await instantiate(rec);
      set((s) => ({
        plugins: s.plugins.map((p) =>
          p.manifest.id === id
            ? { ...p, enabled: true, instance, error: null, status: instance.status?.() ?? null }
            : p,
        ),
      }));
    } catch (err) {
      set((s) => ({
        plugins: s.plugins.map((p) =>
          p.manifest.id === id ? { ...p, enabled: true, instance: null, error: String(err) } : p,
        ),
      }));
    }
  },
  setSettings: async (id, values) => {
    await kvSet(`plugin:${id}:settings`, JSON.stringify(values));
    set((s) => ({
      plugins: s.plugins.map((p) => (p.manifest.id === id ? { ...p, settings: values } : p)),
    }));
    const rec = get().plugins.find((p) => p.manifest.id === id);
    if (rec?.instance) {
      // The context object is shared by reference; update it in place and notify.
      Object.assign(rec.settings, values);
      for (const cb of listenerSets.get(id) ?? []) cb(values);
    }
  },
  refreshStatus: () => {
    set((s) => ({
      plugins: s.plugins.map((p) =>
        p.instance ? { ...p, status: p.instance.status?.() ?? p.status } : p,
      ),
    }));
  },
}));

/** Load persisted enable/settings state and start enabled plugins. Call once at startup. */
export async function startPluginHost(): Promise<void> {
  const records: PluginRecord[] = [];
  for (const def of firstPartyPlugins) {
    const manifest = PluginManifestSchema.parse(def.manifest);
    const enabledRaw = await kvGet(`plugin:${manifest.id}:enabled`);
    const enabled = enabledRaw === null ? manifest.enabledByDefault : enabledRaw === '1';
    const defaults: SettingsValues = {};
    for (const f of def.settingsFields ?? [])
      if (f.default !== undefined) defaults[f.key] = f.default;
    const stored = await kvGet(`plugin:${manifest.id}:settings`);
    const settings: SettingsValues = {
      ...defaults,
      ...(stored ? (JSON.parse(stored) as SettingsValues) : {}),
    };
    records.push({ def, manifest, enabled, settings, instance: null, status: null, error: null });
  }
  usePluginHost.setState({ plugins: records });
  for (const rec of records)
    if (rec.enabled) await usePluginHost.getState().setEnabled(rec.manifest.id, true);
  window.setInterval(() => usePluginHost.getState().refreshStatus(), 2000);
}

/** Lyrics providers from enabled plugins, in settings order. */
export async function lyricsFromPlugins(track: PluginTrack): Promise<LyricsResult | null> {
  for (const p of usePluginHost.getState().plugins) {
    const provider = p.instance?.lyricsProvider;
    if (!p.enabled || !provider) continue;
    try {
      const result = await provider(track);
      if (result) return result;
    } catch (err) {
      console.warn(`[plugin:${p.manifest.id}] lyrics failed`, err);
    }
  }
  return null;
}
