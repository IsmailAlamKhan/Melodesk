import { describe, expect, it } from 'vitest';
import {
  createScrobbleTracker,
  md5,
  parseLrc,
  PluginManifestSchema,
  firstPartyPlugins,
  pickSong,
  cleanLrc,
} from '../src';

describe('parseLrc', () => {
  it('parses timestamps and orders lines', () => {
    const lines = parseLrc('[00:12.50]second\n[00:01.00]first\n[00:20]third');
    expect(lines.map((l) => l.text)).toEqual(['first', 'second', 'third']);
    expect(lines[0]).toEqual({ startMs: 1000, endMs: 12500, text: 'first' });
    expect(lines[2]?.endMs).toBe(25000);
  });
});

describe('md5', () => {
  it('matches known digests', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5('The quick brown fox jumps over the lazy dog')).toBe(
      '9e107d9d372bb6826bd81d3542a419d6',
    );
    expect(md5('héllo')).toBe('be50e8478cf24ff3595bc7307fb91b50');
    expect(md5('x'.repeat(130))).toBe('cfc92f41305ca00c9f9584bf67ae1b54');
  });
});

describe('scrobble tracker', () => {
  const track = {
    videoId: 'v',
    title: 't',
    artist: 'a',
    album: null,
    artworkUrl: null,
    durationSeconds: 200,
  };
  it('scrobbles once after half the track', () => {
    const tr = createScrobbleTracker();
    tr.start(track, 0);
    expect(
      tr.update(track, { playing: true, positionSeconds: 0, durationSeconds: 200 }, 1000),
    ).toBeNull();
    let due = null;
    for (let t = 2000; t <= 120_000; t += 1000)
      due =
        tr.update(track, { playing: true, positionSeconds: t / 1000, durationSeconds: 200 }, t) ??
        due;
    expect(due?.videoId).toBe('v');
    expect(
      tr.update(track, { playing: true, positionSeconds: 150, durationSeconds: 200 }, 150_000),
    ).toBeNull();
  });
  it('ignores paused time and short tracks', () => {
    const tr = createScrobbleTracker();
    tr.start({ ...track, durationSeconds: 20 }, 0);
    expect(
      tr.update(
        { ...track, durationSeconds: 20 },
        { playing: true, positionSeconds: 15, durationSeconds: 20 },
        15_000,
      ),
    ).toBeNull();
    const tr2 = createScrobbleTracker();
    tr2.start(track, 0);
    for (let t = 1000; t <= 200_000; t += 1000)
      tr2.update(track, { playing: false, positionSeconds: 0, durationSeconds: 200 }, t);
    expect(
      tr2.update(track, { playing: true, positionSeconds: 0, durationSeconds: 200 }, 201_000),
    ).toBeNull();
  });
});

describe('first-party manifests', () => {
  it('are valid and declare hosts for network access', () => {
    for (const p of firstPartyPlugins) {
      const m = PluginManifestSchema.parse(p.manifest);
      if (m.permissions.includes('network:fetch')) expect(m.hosts.length).toBeGreaterThan(0);
    }
  });
});

describe('open:link', () => {
  it('Last.fm declares the permission and the one host it may open', () => {
    const lastfm = firstPartyPlugins.find((p) => p.manifest.id === 'lastfm');
    const m = PluginManifestSchema.parse(lastfm?.manifest);
    expect(m.permissions).toContain('open:link');
    expect(m.linkHosts).toEqual(['www.last.fm']);
  });
  it('defaults to no openable hosts', () => {
    const m = PluginManifestSchema.parse({
      id: 'demo',
      name: 'Demo',
      version: '1',
      description: '',
      permissions: [],
    });
    expect(m.linkHosts).toEqual([]);
  });
});

describe('NetEase matching', () => {
  const track = {
    videoId: 'x',
    title: 'Yellow',
    artist: 'Coldplay • Parachutes • 2000',
    album: null,
    artworkUrl: null,
    durationSeconds: 267,
  };
  it('picks the song with the right title, artist and length', () => {
    const song = pickSong(
      [
        { id: 1, name: 'Yellow (Live)', duration: 400000, artists: [{ name: 'Someone Else' }] },
        { id: 2, name: 'Yellow', duration: 266773, artists: [{ name: 'Coldplay' }] },
        { id: 3, name: 'Yellow', duration: 150000, artists: [{ name: 'Cover Band' }] },
      ],
      track,
    );
    expect(song?.id).toBe(2);
  });
  it('returns nothing rather than lyrics for a different song', () => {
    expect(
      pickSong(
        [{ id: 9, name: 'Fix You', duration: 295000, artists: [{ name: 'Coldplay' }] }],
        track,
      ),
    ).toBeNull();
  });
  it('drops credit lines and keeps the lyrics', () => {
    const lrc =
      '[00:00.00]作词 : Chris Martin\n[00:01.00]Look at the stars\n[00:05.00]Look how they shine';
    expect(cleanLrc(lrc)).toBe('[00:01.00]Look at the stars\n[00:05.00]Look how they shine');
  });
});
