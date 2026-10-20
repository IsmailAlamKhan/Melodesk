import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseAccountMenu,
  parseBrowsePage,
  parseNext,
  parseSearchPage,
  parseSuggestions,
} from '../src';

const dir = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures');
const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(dir, name), 'utf8')) as unknown;

describe('browse pages (logged-out fixtures)', () => {
  for (const f of readdirSync(dir).filter(
    (f) => f.startsWith('browse-') && f.endsWith('.json') && !f.startsWith('browse-album'),
  )) {
    it(`parses ${f} into shelves with items`, () => {
      const page = parseBrowsePage(load(f));
      const itemCount = page.shelves.reduce((n, s) => n + s.items.length, 0);
      expect(itemCount).toBeGreaterThan(0);
      expect(page.unknownRenderers).toEqual([]);
      // every item classified (generic is allowed but should be rare)
      const generic = page.shelves.flatMap((s) => s.items).filter((i) => i.kind === 'generic');
      expect(generic.length).toBeLessThanOrEqual(Math.ceil(itemCount * 0.05));
    });
  }

  it('home: shelves, chips and a continuation token', () => {
    const page = parseBrowsePage(load('browse-home.logged-out.json'));
    expect(page.shelves.map((s) => s.title)).toContain('Indian Music');
    expect(page.chips.length).toBeGreaterThan(0);
    expect(page.continuation).toBeTruthy();
    expect(page.background).toMatch(/^https:/u);
    const first = page.shelves[0]?.items[0];
    expect(first?.kind).toBe('playlist');
    expect(first?.menu.map((m) => m.text)).toContain('Play next');
  });

  it('artist: header with subscribe, shuffle, radio; top songs shelf', () => {
    const page = parseBrowsePage(load('browse-artist.logged-out.json'));
    expect(page.header?.title).toBe('Daft Punk');
    expect(page.header?.channelId).toBe('UC_kRDKYrUlrbtrSiyu5Tflg');
    expect(page.header?.shuffleEndpoint?.type).toBe('watch');
    expect(page.header?.radioEndpoint?.type).toBe('watchPlaylist');
    expect(page.header?.actions.find((a) => a.action?.type === 'subscribe')).toBeTruthy();
    const top = page.shelves.find((s) => s.title === 'Top songs');
    expect(top?.layout).toBe('list');
    const song = top?.items[0];
    expect(song?.kind).toBe('song');
    if (song?.kind === 'song') {
      expect(song.videoId).toBe('khnokW3Mw24');
      expect(song.artists.map((a) => a.name)).toEqual(['Daft Punk', 'Julian Casablancas']);
      expect(song.album?.name).toBe('Random Access Memories');
      expect(song.stat).toBe('1.2B plays');
    }
    const albums = page.shelves.find((s) => s.title === 'Albums');
    expect(albums?.items[0]?.kind).toBe('album');
    expect(albums?.moreEndpoint?.type).toBe('browse');
  });

  it('playlist: header and track list with durations and set ids', () => {
    const page = parseBrowsePage(load('browse-playlist.logged-out.json'));
    expect(page.header?.title).toBe('The Hit List');
    expect(page.header?.secondSubtitle).toContain('51 songs');
    expect(page.header?.playEndpoint?.type).toBe('watch');
    const tracks = page.shelves.find((s) =>
      s.id.includes('RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs'),
    );
    expect(tracks?.items.length).toBe(51);
    const t = tracks?.items[0];
    expect(t?.kind).toBe('song');
    if (t?.kind === 'song') {
      expect(t.durationSeconds).toBe(251);
      expect(t.setVideoId).toBe('56B44F6D10557CC6');
      expect(t.likeStatus).toBe('INDIFFERENT');
    }
    expect(tracks?.continuation).toBeTruthy();
  });

  it('moods: category buttons with colors', () => {
    const page = parseBrowsePage(load('browse-moods-and-genres.logged-out.json'));
    const chill = page.shelves.flatMap((s) => s.items).find((i) => i.title === 'Chill');
    expect(chill?.kind).toBe('category');
    expect(chill?.endpoint?.type).toBe('browse');
    if (chill?.kind === 'category') expect(chill.color).toMatch(/^#[0-9a-f]{6}$/u);
  });
});

describe('search', () => {
  it('parses shelves per result type, chips carry filter params', () => {
    const page = parseSearchPage(load('search-daft-punk.logged-out.json'));
    const titles = page.shelves.map((s) => s.title);
    expect(titles[0]).toBe('Top result');
    expect(page.chips.map((c) => c.text)).toContain('Artists');
    expect(page.chips[0]?.endpoint?.type).toBe('search');
    expect(page.unknownRenderers).toEqual([]);
    const top = page.shelves[0]?.items[0];
    expect(top?.kind).toBe('artist');
    // Newer search layout: a flat, mixed list of typed results under the top result.
    const kinds = new Set(page.shelves.slice(1).flatMap((s) => s.items.map((i) => i.kind)));
    expect([...kinds]).toEqual(expect.arrayContaining(['song', 'album', 'artist', 'playlist']));
  });

  it('parses suggestions', () => {
    const s = parseSuggestions(load('search-suggestions.logged-out.json'));
    expect(s[0]).toMatchObject({ type: 'query', text: 'daft punk', boldPrefix: 'daft p' });
    expect(s.some((x) => x.type === 'entity')).toBe(true);
  });
});

describe('next (queue) and account', () => {
  it('parses the up-next list, automix and tab ids', () => {
    const q = parseNext(load('next-video.logged-out.json'));
    expect(q.currentVideoId).toBe('dQw4w9WgXcQ');
    expect(q.items[0]?.kind).toBe('song');
    expect(q.items[0]?.title).toBe('Never Gonna Give You Up');
    expect(q.automixPlaylistId).toBe('RDAMVMdQw4w9WgXcQ');
    expect(q.lyricsBrowseId).toMatch(/^MPLYt_/u);
    expect(q.playingFrom).toBe('Never Gonna Give You Up Mix');
  });

  it('logged-out account menu', () => {
    const a = parseAccountMenu(load('account-menu.logged-out.json'));
    expect(a.signedIn).toBe(false);
  });
});
