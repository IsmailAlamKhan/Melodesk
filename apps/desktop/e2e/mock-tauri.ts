/**
 * A stand-in for the Tauri runtime so the real UI can run in a plain browser. It implements the
 * IPC surface the UI uses (events, SQL key/value, http plugin, player commands) and serves
 * InnerTube responses from the adapter's fixtures. Tests push bridge events with `emit()` and
 * read what the UI sent with `sentCommands()`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, '../../../packages/adapter/tests/fixtures');

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtureDir, `${name}.logged-out.json`), 'utf8')) as unknown;
}

export const LYRICS_BROWSE_ID = 'MPLYt_6AEOVn4k62q';

/** What the fake player returns for each InnerTube call. */
function innertubeResponse(endpoint: string, body: Record<string, unknown>): unknown {
  const id = typeof body['browseId'] === 'string' ? body['browseId'] : '';
  switch (endpoint) {
    case 'browse':
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
  /** Optional native modules this build has (default: unknown, so all are assumed). */
  nativeModules?: string[];
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
  await page.exposeFunction('__nodeData', (endpoint: string, body: Record<string, unknown>) =>
    innertubeResponse(endpoint, body),
  );
  await page.exposeFunction('__nodeHttp', (url: string) => {
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
  await page.addInitScript(() => {
    type Handler = (e: { event: string; id: number; payload: unknown }) => void;
    const w = window as unknown as Record<string, unknown> & {
      __nodeData: (e: string, b: unknown) => Promise<unknown>;
      __nodeHttp: (u: string) => Promise<{ status: number; body: string }>;
    };
    let nextId = 1;
    const listeners = new Map<string, { id: number; handler: number }[]>();
    const sent: Record<string, unknown>[] = [];
    const kv = new Map<string, string>();
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
          return null;
        case 'plugin:sql|load':
          return args['db'];
        case 'plugin:sql|execute': {
          const q = String(args['query']);
          const v = args['values'] as unknown[];
          if (/INSERT INTO settings/iu.test(q)) kv.set(String(v[0]), String(v[1]));
          if (/DELETE FROM settings/iu.test(q)) kv.delete(String(v[0]));
          return [1, 0];
        }
        case 'plugin:sql|select': {
          const q = String(args['query']);
          const v = args['values'] as unknown[];
          if (/FROM settings WHERE key/iu.test(q)) {
            const val = kv.get(String(v[0]));
            return val === undefined ? [] : [{ value: val }];
          }
          return [];
        }
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
        case 'plugin:deep-link|get_current':
        case 'set_native_labels':
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
