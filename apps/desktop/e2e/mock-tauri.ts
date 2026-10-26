/**
 * A stand-in for the Tauri runtime so the real UI can run in a plain browser. It implements the
 * IPC surface the UI uses (events, SQL key/value, http plugin, player commands) and serves
 * InnerTube responses from the adapter's fixtures. Tests push bridge events with `emit()` and
 * read what the UI sent with `sentCommands()`.
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { serveBuiltApp } from './serve-built';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, '../../../packages/adapter/tests/fixtures');

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, `${name}.logged-out.json`), 'utf8')) as unknown;
}

export const LYRICS_BROWSE_ID = 'MPLYt_6AEOVn4k62q';

/** What the fake player returns for each InnerTube call. */
function innertubeResponse(
  endpoint: string,
  body: Record<string, unknown>,
  youtubeLyrics: boolean,
): unknown {
  const id = typeof body['browseId'] === 'string' ? body['browseId'] : '';
  switch (endpoint) {
    case 'browse':
      if (id === LYRICS_BROWSE_ID && !youtubeLyrics) return {};
      if (id === LYRICS_BROWSE_ID)
        return {
          contents: {
            sectionListRenderer: {
              contents: [
                {
                  musicDescriptionShelfRenderer: {
                    description: { runs: [{ text: 'First plain line\nSecond plain line' }] },
                    footer: { runs: [{ text: 'Source: test fixture' }] },
                  },
                },
              ],
            },
          },
        };
      if (id === 'FEmusic_explore') return fixture('browse-explore');
      if (id === 'FEmusic_charts') return fixture('browse-charts');
      if (id === 'FEmusic_new_releases') return fixture('browse-new-releases');
      if (id === 'FEmusic_moods_and_genres') return fixture('browse-moods-and-genres');
      if (id.startsWith('MPRE')) return fixture('browse-album');
      if (id.startsWith('UC')) return fixture('browse-artist');
      if (id.startsWith('VL')) return fixture('browse-playlist');
      return fixture('browse-home');
    case 'search':
      return fixture('search-daft-punk');
    case 'playlist/create':
      return { playlistId: 'PLimported1' };
    case 'browse/edit_playlist':
      return { status: 'STATUS_SUCCEEDED' };
    case 'music/get_search_suggestions':
      return fixture('search-suggestions');
    case 'next':
      return fixture('next-video');
    case 'account/account_menu':
      return fixture('account-menu');
    default:
      return {};
  }
}

export interface MockOptions {
  /** Body LRCLIB returns, or null to answer 404 (no timed lyrics). */
  lrclib?: { syncedLyrics: string; plainLyrics: string } | null;
  /** Answers plugin HTTP requests before the built-in ones; return null to fall through. */
  http?: (
    url: string,
  ) => { status: number; body: unknown } | null | Promise<{ status: number; body: unknown } | null>;
  /** Rows for SQL selects the built-in answers do not cover (listening history, for the stats). */
  sql?: (query: string, values: unknown[]) => unknown[] | null;
  /** Optional native modules this build has (default: unknown, so all are assumed). */
  nativeModules?: string[];
  /** False for a song YouTube Music has no lyrics for (default: it has plain ones). */
  youtubeLyrics?: boolean;
  /** The user's own music: the files a scan finds, and what reading them gives. */
  local?: LocalMock;
  /** A Subsonic-compatible server: the content of each API method's answer. */
  server?: { methods: Record<string, Record<string, unknown>>; password?: string };
  /** Answers to web requests that the UI makes through the app (feeds, stations): address -> text. */
  web?: Record<string, string>;
  /** The version the app reports (default 0.0.1). */
  appVersion?: string;
  /** Saved settings the app starts with, as the database would have them (only on the first load). */
  kv?: Record<string, string>;
  /** A folder for settings sync: what the picker answers, and the sync file already in it (if any). */
  sync?: {
    folder: string;
    file?: string;
    git?: boolean;
    /** Cloud folders this computer has. */
    clouds?: { id: string; name: string; path: string }[];
    /** GitHub sign-in is offered; the code it shows and how many "not yet" answers come first. */
    github?: { code: string; pendingPolls?: number; login?: string };
  };
  /** A playlist file the picker offers (Import a playlist). */
  importFile?: { path: string; text: string };
}

/** A song as the scan reports it (see `ScannedTrack` in src-tauri/src/local.rs). */
export interface LocalFixture {
  path: string;
  title: string;
  artist: string;
  album: string | null;
  albumArtist?: string | null;
  trackNo?: number | null;
  discNo?: number | null;
  year?: number | null;
  durationMs?: number;
  lyrics?: string | null;
  replayGainDb?: number | null;
  replayPeak?: number | null;
}

export interface LocalMock {
  files: LocalFixture[];
  /** What the folder picker answers (default: cancelled). */
  pickFolder?: string;
  /** `.lrc` or `.txt` text stored beside a file, by the file's path. */
  sidecars?: Record<string, string>;
  /** Files that have a cover picture. */
  art?: string[];
  /** How long each file plays (a silent clip), in seconds (default 3). */
  clipSeconds?: number;
}

/** Every cover is replaced with a generated gradient: hermetic tests, and no third-party artwork in screenshots. */
async function stubImages(page: Page): Promise<void> {
  await page.route(/^https:/u, (route) => {
    const req = route.request();
    const imageHost = /^https:\/\/([^/]*\.)?(ytimg|googleusercontent|ggpht|gstatic)\.com\//u.test(
      req.url(),
    );
    // <img> loads, plus the artwork cache's own fetch() of the same covers.
    if (req.resourceType() !== 'image' && !imageHost) return route.continue();
    let h = 0;
    for (const c of req.url()) h = (h * 31 + c.charCodeAt(0)) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${String(h)} 55% 42%)"/><stop offset="1" stop-color="hsl(${String((h + 50) % 360)} 60% 22%)"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/></svg>`;
    return route.fulfill({
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' }, // as the real image hosts send
      body: svg,
    });
  });
}

export async function installTauri(page: Page, opts: MockOptions = {}): Promise<void> {
  await stubImages(page);
  // After the image stub, so it answers first for the app's own address.
  await serveBuiltApp(page);
  await page.exposeFunction('__nodeData', (endpoint: string, body: Record<string, unknown>) =>
    innertubeResponse(endpoint, body, opts.youtubeLyrics ?? true),
  );
  // The real index table, in the test process, so the library's SQL runs against a real SQLite.
  let lib: DatabaseSync | null = null;
  await page.exposeFunction('__nodeLib', (kind: string, query: string, values: unknown[]) => {
    if (!lib) {
      lib = new DatabaseSync(':memory:');
      for (const file of ['0001_init.sql', '0002_local_music.sql', '0003_local_replaygain.sql'])
        lib.exec(readFileSync(join(here, '../src-tauri/migrations', file), 'utf8'));
    }
    const bound: (string | number | null)[] = [];
    const text = query.replace(/\$(\d+)/gu, (_m, n: string) => {
      bound.push(values[Number(n) - 1] as string | number | null);
      return '?';
    });
    const statement = lib.prepare(text);
    return kind === 'select'
      ? (statement.all(...bound) as unknown[])
      : (statement.run(...bound), []);
  });
  await page.exposeFunction(
    '__nodeSql',
    (query: string, values: unknown[]) => opts.sql?.(query, values) ?? [],
  );
  await page.exposeFunction('__nodeHttp', async (url: string) => {
    const custom = await opts.http?.(url);
    if (custom) return { status: custom.status, body: JSON.stringify(custom.body) };
    if (url.includes('ws.audioscrobbler.com'))
      return { status: 200, body: JSON.stringify({ token: 'test-token' }) };
    if (url.includes('lrclib.net') && opts.lrclib)
      return { status: 200, body: JSON.stringify(opts.lrclib) };
    if (url.includes('music.163.com/api/search'))
      return {
        status: 200,
        body: JSON.stringify({
          result: {
            songs: [
              { id: 7, name: 'Test Song', duration: 200000, artists: [{ name: 'Test Artist' }] },
            ],
          },
        }),
      };
    if (url.includes('music.163.com/api/song/lyric'))
      return {
        status: 200,
        body: JSON.stringify({
          lrc: {
            lyric:
              '[00:00.00]作词 : Someone\n[00:05.00]First netease line\n[00:10.00]Second netease line\n[00:15.00]Third netease line',
          },
        }),
      };
    return { status: 404, body: '{}' };
  });

  await page.addInitScript((modules) => {
    (window as unknown as Record<string, unknown>)['__nativeModules'] = modules;
  }, opts.nativeModules ?? null);
  await page.addInitScript(
    ([local, file, server, web, sync]) => {
      (window as unknown as Record<string, unknown>)['__localMock'] = local;
      (window as unknown as Record<string, unknown>)['__importFile'] = file;
      (window as unknown as Record<string, unknown>)['__syncMock'] = sync;
      (window as unknown as Record<string, unknown>)['__serverMock'] = server;
      (window as unknown as Record<string, unknown>)['__webMock'] = web;
    },
    [
      opts.local ?? null,
      opts.importFile ?? null,
      opts.server ?? null,
      opts.web ?? null,
      opts.sync ?? null,
    ] as const,
  );
  await page.addInitScript(
    ([version, seed]) => {
      (window as unknown as Record<string, unknown>)['__appVersion'] = version;
      if (seed && localStorage.getItem('__mockKv') === null)
        localStorage.setItem('__mockKv', JSON.stringify(Object.entries(seed)));
    },
    [opts.appVersion ?? '0.0.1', opts.kv ?? null] as const,
  );
  await page.addInitScript(() => {
    type Handler = (e: { event: string; id: number; payload: unknown }) => void;
    const w = window as unknown as Record<string, unknown> & {
      __nodeData: (e: string, b: unknown) => Promise<unknown>;
      __nodeHttp: (u: string) => Promise<{ status: number; body: string }>;
      __nodeSql: (q: string, v: unknown[]) => Promise<unknown[]>;
      __nodeLib: (kind: string, q: string, v: unknown[]) => Promise<unknown[]>;
    };
    let nextId = 1;
    const listeners = new Map<string, { id: number; handler: number }[]>();
    const sent: Record<string, unknown>[] = [];
    // Kept in localStorage so a reload keeps it, as the real database does.
    const kv = new Map<string, string>(
      JSON.parse(localStorage.getItem('__mockKv') ?? '[]') as [string, string][],
    );
    const persistKv = (): void => localStorage.setItem('__mockKv', JSON.stringify([...kv]));
    // When each setting last changed (the real table has an updated_at column).
    const changedAt = new Map<string, number>(
      JSON.parse(localStorage.getItem('__mockKvAt') ?? '[]') as [string, number][],
    );
    const persistAt = (): void =>
      localStorage.setItem('__mockKvAt', JSON.stringify([...changedAt]));
    type SyncMock = {
      folder: string;
      file?: string;
      git?: boolean;
      clouds?: { id: string; name: string; path: string }[];
      github?: { code: string; pendingPolls?: number; login?: string };
    };
    const syncMock = (): SyncMock | null => (w['__syncMock'] as SyncMock | null) ?? null;
    let githubPolls = 0;
    let syncFile: string | null = syncMock()?.file ?? null;
    let syncStamp = 1;
    let settings = {
      closeToTray: true,
      launchAtLogin: false,
      notifyOnTrackChange: false,
      shortcuts: {
        playPause: null as string | null,
        next: null as string | null,
        previous: null as string | null,
        volumeUp: null as string | null,
        volumeDown: null as string | null,
        mute: null as string | null,
        showHide: null as string | null,
      },
    };
    const bodies = new Map<number, number[]>();
    const urls = new Map<number, string>();
    const replies = new Map<number, { status: number; body: string }>();
    const unhandled: string[] = [];

    const emit = (event: string, payload: unknown): void => {
      for (const l of listeners.get(event) ?? []) {
        const cb = w[`_${String(l.handler)}`] as Handler | undefined;
        cb?.({ event, id: l.id, payload });
      }
    };

    const transformCallback = (cb: Handler, once?: boolean): number => {
      const id = nextId++;
      w[`_${String(id)}`] = (data: never) => {
        if (once) w[`_${String(id)}`] = undefined;
        cb(data);
      };
      return id;
    };

    const serverMock = (): NonNullable<MockOptions['server']> | null =>
      (w['__serverMock'] as NonNullable<MockOptions['server']> | null) ?? null;
    const webMock = (): Record<string, string> =>
      (w['__webMock'] as Record<string, string> | null) ?? {};
    const importFile = (): { path: string; text: string } | null =>
      (w['__importFile'] as { path: string; text: string } | null) ?? null;
    const localMock = (): LocalMock | null => (w['__localMock'] as LocalMock | null) ?? null;
    /** A silent WAV of the given length: real audio the browser can load and play. */
    const clip = (seconds: number): ArrayBuffer => {
      const rate = 8000;
      const n = rate * seconds;
      const buf = new ArrayBuffer(44 + n);
      const dv = new DataView(buf);
      const tag = (o: number, text: string): void => {
        for (let i = 0; i < text.length; i += 1) dv.setUint8(o + i, text.charCodeAt(i));
      };
      tag(0, 'RIFF');
      dv.setUint32(4, 36 + n, true);
      tag(8, 'WAVE');
      tag(12, 'fmt ');
      dv.setUint32(16, 16, true);
      dv.setUint16(20, 1, true);
      dv.setUint16(22, 1, true);
      dv.setUint32(24, rate, true);
      dv.setUint32(28, rate, true);
      dv.setUint16(32, 1, true);
      dv.setUint16(34, 8, true);
      tag(36, 'data');
      dv.setUint32(40, n, true);
      new Uint8Array(buf, 44).fill(128);
      return buf;
    };
    const png = (): ArrayBuffer => {
      const b64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
    };

    const invoke = async (cmd: string, args: Record<string, unknown> = {}): Promise<unknown> => {
      switch (cmd) {
        case 'plugin:event|listen': {
          const event = args['event'] as string;
          const id = nextId++;
          listeners.set(event, [
            ...(listeners.get(event) ?? []),
            { id, handler: args['handler'] as number },
          ]);
          return id;
        }
        case 'plugin:event|unlisten':
        case 'plugin:event|emit':
        case 'plugin:event|emit_to':
          return null;
        case 'plugin:sql|load':
          return args['db'];
        case 'plugin:sql|execute': {
          const q = String(args['query']);
          const v = args['values'] as unknown[];
          if (/local_tracks/iu.test(q)) {
            await w.__nodeLib('execute', q, v);
            return [1, 0];
          }
          if (/INSERT INTO settings/iu.test(q)) {
            kv.set(String(v[0]), String(v[1]));
            changedAt.set(String(v[0]), Number(v[2]));
          }
          if (/DELETE FROM settings/iu.test(q)) {
            kv.delete(String(v[0]));
            changedAt.delete(String(v[0]));
          }
          persistKv();
          persistAt();
          return [1, 0];
        }
        case 'plugin:sql|select': {
          const q = String(args['query']);
          const v = args['values'] as unknown[];
          if (/local_tracks/iu.test(q)) return w.__nodeLib('select', q, v);
          if (/SELECT key, value, updated_at FROM settings/iu.test(q))
            return [...kv].map(([key, value]) => ({
              key,
              value,
              updated_at: changedAt.get(key) ?? 0,
            }));
          if (/FROM settings WHERE key/iu.test(q)) {
            const val = kv.get(String(v[0]));
            return val === undefined ? [] : [{ value: val }];
          }
          return w.__nodeSql(q, v);
        }
        case 'plugin:dialog|open': {
          const options = (args['options'] ?? {}) as { directory?: boolean };
          if (options.directory) return localMock()?.pickFolder ?? syncMock()?.folder ?? null;
          return importFile()?.path ?? null;
        }
        case 'youtube_set_enabled':
          sent.push({ type: 'youtube_set_enabled', enabled: args['enabled'] });
          return null;
        case 'sync_cloud_options':
          return syncMock()?.clouds ?? [];
        case 'sync_use_cloud': {
          const cloud = syncMock()?.clouds?.find((c) => c.id === args['id']);
          sent.push({ type: 'sync_use_cloud', id: args['id'] });
          return cloud ? { path: `${cloud.path}/Melodesk`, git: false } : null;
        }
        case 'sync_github_available':
          return syncMock()?.github !== undefined;
        case 'sync_github_start':
          sent.push({ type: 'sync_github_start' });
          githubPolls = 0;
          return {
            userCode: syncMock()?.github?.code ?? 'AAAA-BBBB',
            verificationUri: 'https://github.com/login/device',
            interval: 1,
            expiresIn: 60,
          };
        case 'sync_github_poll': {
          githubPolls += 1;
          const gh = syncMock()?.github;
          if (githubPolls <= (gh?.pendingPolls ?? 0)) return { status: 'pending', login: null };
          return { status: 'done', login: gh?.login ?? null };
        }
        case 'sync_github_resume':
          return false;
        case 'sync_github_sign_out':
          sent.push({ type: 'sync_github_sign_out' });
          return null;
        case 'sync_set_folder':
          sent.push({ type: 'sync_set_folder', path: args['path'] });
          return args['path'] ? { path: args['path'], git: syncMock()?.git ?? false } : null;
        case 'sync_read':
          return syncFile;
        case 'sync_write':
          syncFile = String(args['text']);
          syncStamp += 1;
          sent.push({ type: 'sync_write', text: syncFile });
          return null;
        case 'sync_stamp':
          return syncFile === null ? null : syncStamp;
        case 'net_allow':
          sent.push({ type: 'net_allow', hosts: args['hosts'] });
          return null;
        case 'net_text': {
          const url = new URL(String(args['url']));
          sent.push({ type: 'net_text', url: url.origin + url.pathname });
          const web = webMock()[url.origin + url.pathname];
          if (web !== undefined) return web;
          const server = serverMock();
          const method = /\/rest\/(\w+)\.view$/u.exec(url.pathname)?.[1];
          if (!server || !method) throw new Error('that address is not one you added');
          const bad = server.password !== undefined && url.searchParams.get('t') === null;
          const content = server.methods[method];
          if (bad || !content)
            return JSON.stringify({
              'subsonic-response': {
                status: 'failed',
                error: { code: 40, message: 'Wrong username or password' },
              },
            });
          return JSON.stringify({
            'subsonic-response': { status: 'ok', version: '1.16.1', ...content },
          });
        }
        case 'net_bytes': {
          const url = new URL(String(args['url']));
          sent.push({
            type: 'net_bytes',
            url: url.origin + url.pathname,
            id: url.searchParams.get('id'),
            openRedirects: args['openRedirects'] ?? false,
          });
          return url.pathname.endsWith('getCoverArt.view')
            ? png()
            : clip(localMock()?.clipSeconds ?? 3);
        }
        case 'radio_open':
          sent.push({ type: 'radio_open', url: args['url'] });
          return 'http://127.0.0.1:9/r/00000000000000000000000000000000';
        case 'plugin:dialog|save':
          return '/home/me/saved-file';
        case 'plugin:fs|write_text_file':
          sent.push({ type: 'write_text_file' });
          return null;
        case 'plugin:fs|read_text_file':
          sent.push({ type: 'read_text_file', path: args['path'] });
          return new TextEncoder().encode(importFile()?.text ?? '').buffer;
        case 'local_scan': {
          const lm = localMock();
          const roots = args['roots'] as string[];
          const known = new Map(
            (args['known'] as { path: string; mtime: number; size: number }[]).map((k) => [
              k.path,
              `${String(k.mtime)}:${String(k.size)}`,
            ]),
          );
          const files = (lm?.files ?? []).filter((f) => roots.some((r) => f.path.startsWith(r)));
          const changed = files
            .filter((f) => known.get(f.path) !== `1:1`)
            .map((f) => ({
              albumArtist: null,
              trackNo: null,
              discNo: null,
              year: null,
              genre: null,
              durationMs: 200_000,
              lyrics: null,
              replayGainDb: null,
              replayPeak: null,
              ...f,
              mtime: 1,
              size: 1,
              hasArt: (lm?.art ?? []).includes(f.path),
            }));
          sent.push({ type: 'local_scan', roots, changed: changed.length });
          if (changed.length > 0) emit('local:scan-batch', changed);
          emit('local:scan-progress', files.length);
          return { seen: files.map((f) => f.path), added: changed.length, failed: 0 };
        }
        case 'local_read_file': {
          sent.push({ type: 'local_read_file', path: args['path'] });
          return clip(localMock()?.clipSeconds ?? 3);
        }
        case 'local_artwork': {
          const has = (localMock()?.art ?? []).includes(String(args['path']));
          return has ? png() : new ArrayBuffer(0);
        }
        case 'local_write_tags': {
          const edit = args['edit'] as Record<string, unknown>;
          const file = (localMock()?.files ?? []).find((f) => f.path === args['path']);
          sent.push({ type: 'local_write_tags', path: args['path'], edit });
          if (!file) throw new Error('not in your music folders');
          return {
            albumArtist: null,
            trackNo: null,
            discNo: null,
            year: null,
            genre: null,
            durationMs: 200_000,
            lyrics: null,
            replayGainDb: null,
            replayPeak: null,
            ...file,
            ...edit,
            mtime: 2,
            size: 1,
            hasArt: false,
          };
        }
        case 'local_lyrics_sidecar':
          return localMock()?.sidecars?.[String(args['path'])] ?? null;
        case 'local_set_active':
        case 'local_report':
          sent.push({ type: cmd, ...args });
          return null;
        case 'get_settings':
          return settings;
        case 'plugin:opener|open_url':
          sent.push({ type: 'open_url', url: args['url'] });
          return null;
        case 'set_settings':
          settings = args['settings'] as typeof settings;
          sent.push({ type: 'set_settings', settings });
          return null;
        case 'player_command': {
          const command = args['command'] as Record<string, unknown>;
          sent.push(command);
          if (command['type'] === 'data') {
            const res = await w.__nodeData(command['endpoint'] as string, command['body']);
            window.setTimeout(() => {
              emit('player:event', {
                type: 'dataResponse',
                requestId: command['requestId'],
                ok: true,
                response: res,
              });
            }, 0);
          }
          return null;
        }
        case 'plugin:http|fetch': {
          const rid = nextId++;
          urls.set(rid, (args['clientConfig'] as { url: string }).url);
          return rid;
        }
        case 'plugin:http|fetch_send': {
          const rid = args['rid'] as number;
          const reply = await w.__nodeHttp(urls.get(rid) ?? '');
          const resRid = nextId++;
          replies.set(resRid, reply);
          bodies.set(resRid, [...new TextEncoder().encode(reply.body)]);
          return {
            status: reply.status,
            statusText: reply.status === 200 ? 'OK' : 'Not Found',
            url: urls.get(rid),
            headers: [['content-type', 'application/json']],
            rid: resRid,
          };
        }
        case 'plugin:http|fetch_read_body': {
          const rid = args['rid'] as number;
          const data = bodies.get(rid);
          if (data) {
            bodies.delete(rid);
            return [...data, 0];
          }
          return [1];
        }
        case 'native_modules':
          return w['__nativeModules'] ?? null;
        case 'plugin:http|fetch_cancel':
        case 'plugin:http|fetch_cancel_body':
        case 'plugin:app|version':
          return w['__appVersion'];
        case 'plugin:deep-link|get_current':
        case 'set_native_labels':
        case 'player_reload':
          sent.push({ type: 'player_reload' });
          return null;
        case 'player_set_visible':
          return null;
        default:
          unhandled.push(cmd);
          return null;
      }
    };

    w['__TAURI_INTERNALS__'] = {
      invoke,
      transformCallback,
      convertFileSrc: (p: string) => p,
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { windowLabel: 'main', label: 'main' },
      },
    };
    w['__TAURI_EVENT_PLUGIN_INTERNALS__'] = { unregisterListener: () => undefined };
    w['__emit'] = emit;
    w['__sent'] = sent;
    w['__unhandled'] = unhandled;
  });
}

/** Send a bridge event to the UI, as the player webview would. */
export async function emit(page: Page, payload: Record<string, unknown>): Promise<void> {
  await page.evaluate((p) => {
    (window as unknown as { __emit: (e: string, p: unknown) => void }).__emit('player:event', p);
  }, payload);
}

export async function sentCommands(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() =>
    (window as unknown as { __sent: Record<string, unknown>[] }).__sent.slice(),
  );
}

export const TRACK = {
  videoId: 'dQw4w9WgXcQ',
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  artworkUrl: null as string | null,
};

/** Make the fake player attach and report a playing track. `positionS` is where the song is. */
export async function startPlayback(
  page: Page,
  { positionS = 0, playing = true, track = TRACK } = {},
): Promise<void> {
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await emit(page, { type: 'track', track });
  await setPosition(page, positionS, playing);
}

export async function setPosition(page: Page, positionS: number, playing = true): Promise<void> {
  await emit(page, {
    type: 'state',
    state: {
      playing,
      position: positionS,
      duration: 200,
      volume: 0.5,
      muted: false,
      sampledAt: Date.now(),
    },
  });
}
