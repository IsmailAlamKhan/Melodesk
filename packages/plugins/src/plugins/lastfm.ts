import { definePlugin, type PluginTrack } from '../sdk';
import { createScrobbleTracker } from '../scrobble';

/**
 * Last.fm scrobbling. Needs an API key and secret from https://www.last.fm/api/account/create
 * (Melodesk ships none: the key identifies the app and must stay with whoever distributes it).
 * Auth is Last.fm's desktop flow: get a token, the user approves it in the browser, then the
 * token is exchanged for a session key, which is stored in plugin storage.
 */
export const lastfm = definePlugin({
  manifest: {
    id: 'lastfm',
    name: 'Last.fm',
    version: '1.0.0',
    description: 'Scrobbles what you listen to (title, artist, album) to your Last.fm account.',
    permissions: ['playback:read', 'network:fetch', 'storage:plugin', 'notifications', 'open:link'],
    hosts: ['ws.audioscrobbler.com'],
    linkHosts: ['www.last.fm'],
  },
  settingsFields: [
    { key: 'apiKey', label: 'API key', type: 'text' },
    { key: 'apiSecret', label: 'Shared secret', type: 'password' },
  ],
  async setup(ctx) {
    const tracker = createScrobbleTracker();
    let status = 'Not connected';
    let sessionKey = (await ctx.storage?.get<string>('sessionKey')) ?? null;
    let pendingToken: string | null = null;
    if (sessionKey) status = 'Connected';

    const key = (): string => String(ctx.settings['apiKey'] ?? '');
    const secret = (): string => String(ctx.settings['apiSecret'] ?? '');
    const sign = (params: Record<string, string>): string => {
      const base = Object.keys(params)
        .sort()
        .map((k) => `${k}${params[k] ?? ''}`)
        .join('');
      return md5(base + secret());
    };
    const call = async (
      method: string,
      params: Record<string, string>,
      post = false,
    ): Promise<Record<string, unknown>> => {
      if (!ctx.fetch) throw new Error('no network permission');
      const all: Record<string, string> = { method, api_key: key(), ...params };
      all['api_sig'] = sign(all);
      all['format'] = 'json';
      const body = new URLSearchParams(all).toString();
      const res = post
        ? await ctx.fetch('https://ws.audioscrobbler.com/2.0/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
          })
        : await ctx.fetch(`https://ws.audioscrobbler.com/2.0/?${body}`);
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok || typeof json['error'] === 'number') {
        const msg = json['message'];
        throw new Error(typeof msg === 'string' ? msg : `HTTP ${String(res.status)}`);
      }
      return json;
    };

    const unsubTrack = ctx.player?.onTrackChange((track) => {
      const started = tracker.start(track);
      if (!started || !sessionKey) return;
      call(
        'track.updateNowPlaying',
        {
          sk: sessionKey,
          artist: started.artist.split(' • ')[0] ?? started.artist,
          track: started.title,
          ...(started.album ? { album: started.album } : {}),
        },
        true,
      )
        .then(() => {
          status = `Now playing “${started.title}”`;
        })
        .catch((e: unknown) => {
          status = `Error: ${String(e)}`;
        });
    });
    const unsubState = ctx.player?.onStateChange((state) => {
      const current = ctx.player?.current().track ?? null;
      const due = tracker.update(current, state) as (PluginTrack & { startedAt: number }) | null;
      if (!due || !sessionKey) return;
      call(
        'track.scrobble',
        {
          sk: sessionKey,
          'artist[0]': due.artist.split(' • ')[0] ?? due.artist,
          'track[0]': due.title,
          'timestamp[0]': String(Math.floor(due.startedAt / 1000)),
          ...(due.album ? { 'album[0]': due.album } : {}),
        },
        true,
      )
        .then(() => {
          status = `Scrobbled “${due.title}”`;
        })
        .catch((e: unknown) => {
          status = `Error: ${String(e)}`;
        });
    });

    return {
      status: () =>
        !sessionKey && !pendingToken && (!key() || !secret())
          ? 'Enter your API key and secret first'
          : status,
      actions: [
        {
          label: sessionKey ? 'Disconnect' : 'Connect to Last.fm',
          run: async () => {
            if (sessionKey) {
              sessionKey = null;
              await ctx.storage?.remove('sessionKey');
              status = 'Not connected';
              return;
            }
            // status() already says what is missing.
            if (!key() || !secret()) return;
            if (!pendingToken) {
              const res = await call('auth.getToken', {});
              const token = res['token'];
              pendingToken = typeof token === 'string' ? token : '';
              status = 'Approve Melodesk in your browser, then press Connect again';
              ctx.notify?.(
                'Last.fm',
                'Approve Melodesk in your browser, then press Connect again.',
              );
              const url = `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(key())}&token=${encodeURIComponent(pendingToken)}`;
              try {
                await ctx.openLink?.(url);
              } catch (e) {
                status = `Could not open your browser: ${String(e)}`;
                pendingToken = null;
              }
              return;
            }
            const res = await call('auth.getSession', { token: pendingToken });
            const session = res['session'] as { key?: string; name?: string } | undefined;
            if (session?.key) {
              sessionKey = session.key;
              pendingToken = null;
              await ctx.storage?.set('sessionKey', sessionKey);
              status = `Connected as ${session.name ?? 'user'}`;
            }
          },
        },
      ],
      dispose: () => {
        unsubTrack?.();
        unsubState?.();
      },
    };
  },
});

/** MD5 as Last.fm requires for signatures (not for security). Tiny implementation, no dependency. */
export function md5(input: string): string {
  const utf8 = new TextEncoder().encode(input);
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i += 1) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32);
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
    14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const len = utf8.length;
  const padded = new Uint8Array((((len + 8) >> 6) << 6) + 64);
  padded.set(utf8);
  padded[len] = 0x80;
  const bits = len * 8;
  new DataView(padded.buffer).setUint32(padded.length - 8, bits >>> 0, true);
  new DataView(padded.buffer).setUint32(padded.length - 4, Math.floor(bits / 2 ** 32), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const view = new DataView(padded.buffer);
  for (let off = 0; off < padded.length; off += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i += 1) M[i] = view.getUint32(off + i * 4, true);
    let [A, B, C, D] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i += 1) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + (K[i] ?? 0) + (M[g] ?? 0)) >>> 0;
      A = D;
      D = C;
      C = B;
      const s = S[i] ?? 0;
      B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  new DataView(out.buffer).setUint32(0, a0, true);
  new DataView(out.buffer).setUint32(4, b0, true);
  new DataView(out.buffer).setUint32(8, c0, true);
  new DataView(out.buffer).setUint32(12, d0, true);
  return [...out].map((b) => b.toString(16).padStart(2, '0')).join('');
}
