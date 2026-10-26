/**
 * Plugin host: instantiates first-party plugins with exactly the capabilities their manifest
 * declares. Third-party code loading is deliberately not implemented yet (no dynamic imports,
 * no eval); the SDK and permission model are what a sandboxed loader would sit behind.
 */
import {
  PluginManifestSchema,
  firstPartyPlugins,
  lyricsCandidates,
  plainName,
  type SongGuess,
  type LyricsResult,
  type NewRelease,
  type SongInfo,
  type PluginContext,
  type PluginDefinition,
  type PluginInstance,
  type PluginManifest,
  type PluginPlaybackState,
  type PluginTrack,
} from '@melodesk/plugins';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { lyricsProgress, useFeatures, type LyricsStepState } from '../../core';
import { kvDel, kvGet, kvSet } from '../../data/kv';
import { loadLyricsOverride } from '../../data/lyricsOverride';
import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { toast } from '../../app/toast';

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
  /** Set once the saved on/off choices are read and the plugins that are on have started. */
  loaded: boolean;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  setSettings: (id: string, values: SettingsValues) => Promise<void>;
  refreshStatus: () => void;
}

/** Native modules a plugin needs; a build without one does not offer the plugin at all. */
const PLUGIN_NEEDS: Record<string, string> = { discord: 'discord' };

function available(pluginId: string): boolean {
  const need = PLUGIN_NEEDS[pluginId];
  const native = useFeatures.getState().native;
  return need === undefined || native === null || native.has(need);
}

const NATIVE_COMMANDS: Record<string, string[]> = {
  'native:discord': ['discord_set_activity', 'discord_clear'],
};

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
  if (has('open:link')) {
    const linkHosts = new Set(manifest.linkHosts);
    ctx.openLink = async (url) => {
      const u = new URL(url);
      if (u.protocol !== 'https:' || !linkHosts.has(u.hostname))
        throw new Error(`plugin ${manifest.id} may not open ${u.hostname}`);
      await openUrl(url);
    };
  }
  if (has('network:fetch')) {
    ctx.fetch = async (url, init) => {
      const u = new URL(url);
      // https only, except for this computer: a plugin that lists `localhost` may talk to a program
      // running here (such as Ollama) over plain http, and nothing else may use http.
      const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      if (!hosts.has(u.hostname) || (u.protocol !== 'https:' && !(local && u.protocol === 'http:')))
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
  loaded: false,
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
    const rec = get().plugins.find((p) => p.manifest.id === id);
    if (!rec) return;
    // A running plugin holds `rec.settings` by reference (its context was built from it), so update
    // that very object in place. Replacing it would leave the plugin reading the old values until
    // the app restarts.
    for (const key of Object.keys(rec.settings)) Reflect.deleteProperty(rec.settings, key);
    Object.assign(rec.settings, values);
    // New record objects make the UI re-render; `settings` keeps its identity.
    set((s) => ({ plugins: s.plugins.map((p) => (p.manifest.id === id ? { ...p } : p)) }));
    if (rec.instance) for (const cb of listenerSets.get(id) ?? []) cb(values);
    get().refreshStatus();
  },
  refreshStatus: () => {
    set((s) => ({
      plugins: s.plugins.map((p) =>
        p.instance ? { ...p, status: p.instance.status?.() ?? p.status } : p,
      ),
    }));
  },
}));

/**
 * Load persisted enable/settings state and start enabled plugins. Returns a function that stops the
 * host: it halts the status timer and disposes every running plugin.
 */
export function startPluginHost(): () => void {
  // An object, not a bare `let`: the async part below must see the change made by the stop function.
  const run = { stopped: false };
  const isStopped = (): boolean => run.stopped;
  let timer = 0;
  void (async () => {
    const records: PluginRecord[] = [];
    for (const def of firstPartyPlugins) {
      if (!available(def.manifest.id)) continue;
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
    if (isStopped()) return;
    usePluginHost.setState({ plugins: records });
    for (const rec of records)
      if (rec.enabled && !isStopped())
        await usePluginHost.getState().setEnabled(rec.manifest.id, true);
    if (isStopped()) return;
    usePluginHost.setState({ loaded: true });
    timer = window.setInterval(() => usePluginHost.getState().refreshStatus(), 2000);
  })().catch((err: unknown) => {
    console.error('plugin host failed', err);
  });
  return () => {
    run.stopped = true;
    window.clearInterval(timer);
    for (const p of usePluginHost.getState().plugins) p.instance?.dispose?.();
    usePluginHost.setState({ plugins: [], loaded: false });
  };
}

/** Whether a plugin that explains lyric lines is switched on and running. */
export function canExplainLyrics(): boolean {
  return usePluginHost
    .getState()
    .plugins.some((p) => p.enabled && p.instance?.explainLyric !== undefined);
}

/** Ask the first plugin that can to explain a line; it gets a time limit. */
export async function explainLyric(
  track: PluginTrack,
  line: string,
  context: string[],
): Promise<string | null> {
  const p = usePluginHost
    .getState()
    .plugins.find((x) => x.enabled && x.instance?.explainLyric !== undefined);
  if (!p?.instance?.explainLyric) return null;
  return within(
    60_000,
    p.instance.explainLyric({ track, line, context }).catch(() => null),
    null,
  );
}

/** Whether a plugin that knows facts about songs is switched on and running. */
export function isInfoProviderOn(): boolean {
  return usePluginHost
    .getState()
    .plugins.some((p) => p.enabled && p.instance?.songInfo !== undefined);
}

/** Facts about a song from the first plugin that has them; it gets a time limit. */
export async function songInfoFromPlugins(track: PluginTrack): Promise<SongInfo | null> {
  const p = usePluginHost.getState().plugins.find((x) => x.enabled && x.instance?.songInfo);
  if (!p?.instance?.songInfo) return null;
  return within(
    25_000,
    p.instance.songInfo(track).catch(() => null),
    null,
  );
}

/** What these artists released lately, from the first plugin that can say (these lookups are slow on purpose). */
export async function newReleasesFromPlugins(
  artists: string[],
  days: number,
): Promise<NewRelease[]> {
  const p = usePluginHost.getState().plugins.find((x) => x.enabled && x.instance?.newReleases);
  if (!p?.instance?.newReleases) return [];
  return within(
    180_000,
    p.instance.newReleases(artists, days).catch(() => []),
    [],
  );
}

/** Whether a plugin that can turn a description into playlist rules is switched on and running. */
export function canSuggestRules(): boolean {
  return usePluginHost
    .getState()
    .plugins.some((p) => p.enabled && p.instance?.suggestRules !== undefined);
}

/** Ask the first plugin that can to make filter rules from a description; it gets a time limit. */
export async function suggestRulesFromPlugins(description: string): Promise<unknown> {
  const p = usePluginHost.getState().plugins.find((x) => x.enabled && x.instance?.suggestRules);
  if (!p?.instance?.suggestRules) return null;
  return within(
    60_000,
    p.instance.suggestRules(description).catch(() => null),
    null,
  );
}

/** Which plugins that find or help find lyrics are switched on, as a stable text. */
export function lyricsSignature(): string {
  return usePluginHost
    .getState()
    .plugins.filter(
      (p) =>
        p.enabled &&
        (p.manifest.provides.includes('lyrics') || p.manifest.provides.includes('identify')),
    )
    .map((p) => p.manifest.id)
    .sort()
    .join(',');
}

/** Whether any plugin that provides lyrics is switched on. */
export function isLyricsProviderOn(): boolean {
  return usePluginHost
    .getState()
    .plugins.some((p) => p.enabled && p.manifest.provides.includes('lyrics'));
}

const PROVIDER_BUDGET_MS = 14_000;
const IDENTIFY_BUDGET_MS = 30_000;

const within = <T>(ms: number, work: Promise<T>, fallback: T): Promise<T> =>
  Promise.race([work, new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms))]);

/**
 * Every enabled lyrics plugin tries every guess at once: each plugin works through the guesses in
 * order within a time budget, and the best answer wins (the first timed result in settings order,
 * else the first plain one). A guess that is not what the player reports is looked up without the
 * track's length (a cover is not the original's length) and the result says how it was matched.
 */
async function askProviders(
  track: PluginTrack,
  guesses: readonly SongGuess[],
): Promise<LyricsResult | null> {
  const providers = usePluginHost
    .getState()
    .plugins.filter((p) => p.enabled && p.instance?.lyricsProvider);
  const report = (id: string, label: string, state: LyricsStepState, detail?: string): void =>
    lyricsProgress.step(track.videoId, {
      id,
      label,
      state,
      ...(detail !== undefined ? { detail } : {}),
    });
  const answers = await Promise.all(
    providers.map(async (p) => {
      const id = `plugin:${p.manifest.id}`;
      const name = p.manifest.name;
      report(id, name, 'running');
      const slow = Symbol('slow');
      const answer = await within<LyricsResult | null | typeof slow>(
        PROVIDER_BUDGET_MS,
        (async (): Promise<LyricsResult | null> => {
          let plain: LyricsResult | null = null;
          for (const g of guesses) {
            report(id, name, 'running', g.title);
            const asked: PluginTrack = {
              ...track,
              title: g.title,
              artist: g.artist,
              durationSeconds: g.source === 'reported' ? track.durationSeconds : null,
            };
            try {
              const found = await p.instance?.lyricsProvider?.(asked);
              if (!found) continue;
              const labelled =
                g.source === 'reported'
                  ? found
                  : { ...found, source: `${found.source} · matched as “${g.title}”` };
              if (labelled.synced?.length) return labelled;
              plain ??= labelled;
            } catch (err) {
              console.warn(`[plugin:${p.manifest.id}] lyrics failed`, err);
            }
          }
          return plain;
        })(),
        slow,
      );
      if (answer === slow) report(id, name, 'slow');
      else report(id, name, answer ? 'found' : 'none');
      return answer === slow ? null : answer;
    }),
  );
  const found = answers.filter((a): a is LyricsResult => a !== null);
  return found.find((a) => a.synced?.length) ?? found[0] ?? null;
}

/**
 * Lyrics for a track from the enabled plugins. First the listener's own correction, then the title
 * as the player reports it and cleaned-up versions of it (covers, "From the film …", "Artist - Song").
 * Only if all of that finds nothing, and an AI song finder is on, is it asked which song this is.
 */
export async function lyricsFromPlugins(track: PluginTrack): Promise<LyricsResult | null> {
  const override = await loadLyricsOverride(track.videoId);
  const user: SongGuess[] = override ? [{ ...override, source: 'user' }] : [];
  const tried = [...user, ...lyricsCandidates(track)];
  const first = await askProviders(track, tried);
  if (first) return first;

  const finders = usePluginHost
    .getState()
    .plugins.filter((p) => p.enabled && p.instance?.identifySong);
  if (finders.length === 0) return null;
  const seen = new Set(tried.map((g) => `${plainName(g.title)}|${plainName(g.artist)}`));
  lyricsProgress.step(track.videoId, { id: 'ai', label: 'ai', state: 'running' });
  const ai = (
    await Promise.all(
      finders.map((p) =>
        within(
          IDENTIFY_BUDGET_MS,
          p.instance?.identifySong?.(track) ?? Promise.resolve([]),
          [],
        ).catch(() => []),
      ),
    )
  )
    .flat()
    .map((g): SongGuess => ({ ...g, source: 'ai' }))
    .filter((g) => {
      const key = `${plainName(g.title)}|${plainName(g.artist)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  lyricsProgress.step(track.videoId, {
    id: 'ai',
    label: 'ai',
    state: ai.length > 0 ? 'found' : 'none',
    detail: ai.map((g) => g.title).join(', '),
  });
  return ai.length > 0 ? askProviders(track, ai) : null;
}

export function isPluginEnabled(id: string): boolean {
  return usePluginHost.getState().plugins.some((p) => p.manifest.id === id && p.enabled);
}

export async function enablePlugin(id: string): Promise<void> {
  await usePluginHost.getState().setEnabled(id, true);
}
