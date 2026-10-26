import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildInfo,
  isRecent,
  musicbrainz,
  pickRecording,
  primaryArtist,
  recordingQuery,
  type PluginContext,
} from '../src';

const track = {
  videoId: 'x',
  title: 'Yellow (Official Video)',
  artist: 'Coldplay • Parachutes • 2000',
  album: null,
  artworkUrl: null,
  durationSeconds: 266,
};

describe('primaryArtist', () => {
  it('takes the artist from the player’s "Artist • Album • Year" and from credits', () => {
    expect(primaryArtist('Coldplay • Parachutes • 2000')).toBe('Coldplay');
    expect(primaryArtist('Drake feat. Rihanna')).toBe('Drake');
    expect(primaryArtist('Simon & Garfunkel')).toBe('Simon');
    expect(primaryArtist('Plain Name')).toBe('Plain Name');
  });
});

describe('recordingQuery', () => {
  it('quotes the cleaned title and the artist, and cannot be broken out of', () => {
    expect(recordingQuery('Yellow (Official Video)', 'Coldplay')).toBe(
      'recording:"Yellow" AND artist:"Coldplay"',
    );
    // Only the four quotes that wrap the two phrases survive.
    expect(recordingQuery('A" OR artist:"x', 'B\\').split('"')).toHaveLength(5);
  });
});

describe('pickRecording', () => {
  const rec = (title: string, artist: string, score: number, releases = 1) => ({
    title,
    score,
    'artist-credit': [{ name: artist, artist: { id: 'a', name: artist } }],
    releases: Array.from({ length: releases }, (_, i) => ({
      id: String(i),
      title: 'R',
      date: '2000',
    })),
  });
  it('wants the title and the artist to match, then the best score', () => {
    const got = pickRecording(
      [
        rec('Yellow', 'Other Band', 100),
        rec('Yellow Submarine', 'Coldplay', 100),
        rec('Yellow', 'Coldplay', 80),
        rec('Yellow', 'Coldplay', 95, 0),
      ],
      'Yellow',
      'Coldplay',
    );
    expect(got?.score).toBe(95);
    expect(pickRecording([rec('Nope', 'Coldplay', 100)], 'Yellow', 'Coldplay')).toBeNull();
  });
});

describe('isRecent', () => {
  const now = Date.UTC(2026, 9, 26);
  it('counts dates in the window and never future ones', () => {
    expect(isRecent('2026-10-01', 60, now)).toBe(true);
    expect(isRecent('2026-07-01', 60, now)).toBe(false);
    expect(isRecent('2026-12-25', 60, now)).toBe(false);
    expect(isRecent('2026-09', 60, now)).toBe(true);
    expect(isRecent('2025', 400, now)).toBe(true);
    expect(isRecent('2026', 400, now)).toBe(false);
    expect(isRecent('soon', 60, now)).toBe(false);
    expect(isRecent(undefined, 60, now)).toBe(false);
  });
});

describe('buildInfo', () => {
  it('uses the earliest release and the artist’s life span', () => {
    const info = buildInfo(
      track,
      {
        id: 'r1',
        title: 'Yellow',
        'artist-credit': [{ artist: { id: 'a1', name: 'Coldplay' } }],
        releases: [
          { title: 'Reissue', date: '2011-05-01' },
          { title: 'Parachutes', date: '2000-06-26' },
        ],
        tags: [
          { name: 'rock', count: 1 },
          { name: 'alternative rock', count: 5 },
        ],
      },
      {
        country: 'GB',
        type: 'Group',
        disambiguation: '',
        'life-span': { begin: '1996', ended: false },
        genres: [{ name: 'britpop', count: 3 }],
      },
    );
    expect(info).toMatchObject({
      album: 'Parachutes',
      released: '2000-06-26',
      genres: ['alternative rock', 'rock'],
      artistDetails: {
        country: 'GB',
        kind: 'Group',
        active: '1996 – present',
        note: null,
        genres: ['britpop'],
      },
    });
    expect(info.links.map((l) => l.url)).toEqual([
      'https://musicbrainz.org/recording/r1',
      'https://musicbrainz.org/artist/a1',
    ]);
  });
});

describe('the plugin', () => {
  const store = new Map<string, unknown>();
  const urls: string[] = [];
  const headers: (Record<string, string> | undefined)[] = [];
  const answer = (url: string): unknown => {
    if (url.includes('/recording?'))
      return {
        recordings: [
          {
            id: 'r1',
            title: 'Yellow',
            score: 100,
            'artist-credit': [{ artist: { id: 'a1', name: 'Coldplay' } }],
            releases: [{ title: 'Parachutes', date: '2000-06-26' }],
          },
        ],
      };
    if (url.includes('/artist/a1'))
      return { name: 'Coldplay', country: 'GB', type: 'Group', 'life-span': { begin: '1996' } };
    if (url.includes('/artist?')) return { artists: [{ id: 'a1', name: 'Coldplay', score: 100 }] };
    if (url.includes('/release-group?'))
      return {
        'release-groups': [
          {
            id: 'g1',
            title: 'New One',
            'primary-type': 'Album',
            'first-release-date': '2026-10-10',
          },
          {
            id: 'g2',
            title: 'Old One',
            'primary-type': 'Album',
            'first-release-date': '2000-01-01',
          },
        ],
      };
    return {};
  };
  const ctx = (): PluginContext =>
    ({
      manifest: musicbrainz.manifest,
      settings: {},
      onSettingsChange: () => () => undefined,
      log: () => undefined,
      fetch: (url: string, init?: { headers?: Record<string, string> }) => {
        urls.push(url);
        headers.push(init?.headers);
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(''),
          json: () => Promise.resolve(answer(url)),
        });
      },
      storage: {
        get: <T>(k: string) => Promise.resolve((store.get(k) as T | undefined) ?? null),
        set: (k: string, v: unknown) => Promise.resolve(void store.set(k, v)),
        remove: (k: string) => Promise.resolve(void store.delete(k)),
      },
    }) as unknown as PluginContext;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    store.clear();
    urls.length = 0;
    headers.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('names itself in the request, spaces requests apart, and caches what it learned', async () => {
    const plugin = await musicbrainz.setup(ctx());
    const run = plugin.songInfo?.(track);
    await vi.runAllTimersAsync();
    const info = await run;
    expect(info?.released).toBe('2000-06-26');
    expect(info?.artistDetails?.country).toBe('GB');
    expect(urls).toHaveLength(2);
    expect(headers[0]?.['User-Agent']).toContain('Melodesk');
    const again = plugin.songInfo?.(track);
    await vi.runAllTimersAsync();
    expect((await again)?.title).toBe('Yellow');
    expect(urls).toHaveLength(2);
  });

  it('lists only releases inside the window', async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 26)));
    const plugin = await musicbrainz.setup(ctx());
    const run = plugin.newReleases?.(['Coldplay'], 60);
    await vi.runAllTimersAsync();
    expect(await run).toEqual([
      {
        artist: 'Coldplay',
        title: 'New One',
        kind: 'Album',
        date: '2026-10-10',
        url: 'https://musicbrainz.org/release-group/g1',
      },
    ]);
  });
});
