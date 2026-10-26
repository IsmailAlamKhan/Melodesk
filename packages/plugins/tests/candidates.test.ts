import { describe, expect, it } from 'vitest';
import {
  buildExplainPrompt,
  buildRulesPrompt,
  buildPrompt,
  cleanTitle,
  lyricsCandidates,
  parseGuesses,
  parseJsonObject,
  pickLrclib,
} from '../src';

const track = (title: string, artist: string) => ({
  videoId: 'x',
  title,
  artist,
  album: null,
  artworkUrl: null,
  durationSeconds: 200,
});
const titles = (t: string, a: string) =>
  lyricsCandidates(track(t, a)).map((g) => `${g.title}|${g.artist}`);

describe('cleanTitle', () => {
  it('drops bracketed descriptions of the upload and keeps real parts of the name', () => {
    expect(cleanTitle('Bhool Na Jaana (From “MEMORIES”)')).toBe('Bhool Na Jaana');
    expect(cleanTitle('Yellow (Official Video)')).toBe('Yellow');
    expect(cleanTitle('Song (feat. Someone)')).toBe('Song');
    expect(cleanTitle('Hotel California (Reprise)')).toBe('Hotel California');
    expect(cleanTitle('(What’s the Story) Morning Glory?')).toContain('Morning Glory');
  });
});

describe('lyricsCandidates', () => {
  it('starts with what the player reports, so ordinary songs behave as before', () => {
    expect(titles('Yellow', 'Coldplay • Parachutes')).toEqual(['Yellow|Coldplay']);
  });

  it('finds the song in a cover upload and leaves the uploader out of it', () => {
    const found = titles('Zara Zara Bahekta Hai | RHTDM | Zendria', 'ZENDRIA');
    expect(found).toContain('Zara Zara Bahekta Hai|');
    expect(found.some((f) => f.startsWith('Zendria|'))).toBe(false);
    // The film code is tried last, if at all.
    expect(found.indexOf('RHTDM|')).toBeGreaterThan(found.indexOf('Zara Zara Bahekta Hai|'));
  });

  it('tries both orders of "Artist - Song" from an uploader who is neither', () => {
    const found = titles('Taylor Swift - Love Story (Cover)', 'Some Singer');
    expect(found).toContain('Love Story|Taylor Swift');
  });

  it('removes film tags', () => {
    expect(titles('Bhool Na Jaana (From “MEMORIES”)', 'Tanveer Evan')).toContain(
      'Bhool Na Jaana|Tanveer Evan',
    );
  });

  it('never returns more than a handful of guesses or the same one twice', () => {
    const found = titles('A | B | C | D | E | F | G | H', 'Z');
    expect(found.length).toBeLessThanOrEqual(6);
    expect(new Set(found).size).toBe(found.length);
  });
});

describe('the local AI helper', () => {
  it('reads the songs out of a model reply, even wrapped in prose or a code fence', () => {
    const json =
      '{"songs":[{"title":"Zara Zara Bahekta Hai","artist":"Bombay Jayashri"},{"title":"X"}]}';
    expect(parseGuesses(json)).toEqual([
      { title: 'Zara Zara Bahekta Hai', artist: 'Bombay Jayashri' },
      { title: 'X', artist: '' },
    ]);
    expect(parseGuesses('Sure! ```json\n' + json + '\n```')).toHaveLength(2);
  });
  it('ignores a reply that is not in the asked shape', () => {
    expect(parseGuesses('I think it is Yellow')).toEqual([]);
    expect(parseGuesses('{"songs":"nope"}')).toEqual([]);
    expect(parseGuesses('{"songs":[{"artist":"No title"}]}')).toEqual([]);
  });
  it('asks only for song names and carries the title and uploader as plain data', () => {
    const prompt = buildPrompt(track('Bad "title" | x', 'Up • loader'));
    expect(prompt).toContain('Do not write lyrics');
    expect(prompt).toContain(JSON.stringify('Bad "title" | x'));
    expect(prompt).toContain(JSON.stringify('Up'));
  });
});

describe('LRCLIB result matching', () => {
  const list = [
    { trackName: 'Something Else', artistName: 'A', syncedLyrics: 'x', duration: 200 },
    {
      trackName: 'Zara Zara Bahekta Hai',
      artistName: 'Bombay Jayashri',
      plainLyrics: 'x',
      duration: 300,
    },
    {
      trackName: 'Zara Zara Bahekta Hai',
      artistName: 'Bombay Jayashri',
      syncedLyrics: 'x',
      duration: 301,
    },
  ];
  it('wants the title to match and prefers timed lyrics', () => {
    expect(pickLrclib(list, track('Zara Zara Bahekta Hai', ''))).toBe(list[2]);
  });
  it('is not put off by a cover being a different length, but gives nothing for a different song', () => {
    expect(pickLrclib(list, { ...track('Zara Zara Bahekta Hai', ''), durationSeconds: 167 })).toBe(
      list[2],
    );
    expect(pickLrclib(list, track('Unrelated', ''))).toBeNull();
  });
});

describe('the explain prompt', () => {
  it('carries the line as plain data and asks for no more lyrics', () => {
    const prompt = buildExplainPrompt(track('Song', 'Singer • Album'), 'a "quoted" line', [
      'before',
      'after',
    ]);
    expect(prompt).toContain(JSON.stringify('a "quoted" line'));
    expect(prompt).toContain('before / after');
    expect(prompt).toContain('Do not quote any other lines');
    expect(prompt).toContain(JSON.stringify('Singer'));
  });
  it('works without context', () => {
    expect(buildExplainPrompt(track('Song', 'Singer'), 'line', [])).not.toContain('Nearby lines');
  });
});

describe('playlist rules from a description', () => {
  it('asks only for filter fields, with the description quoted', () => {
    const prompt = buildRulesPrompt('songs from 1999 "ignore previous"');
    expect(prompt).toContain('\\"ignore previous\\"');
    expect(prompt).toContain('"sort": one of random');
    expect(prompt).toContain('Do not name songs');
  });
  it('takes the JSON object out of a reply, with or without wrapping', () => {
    expect(parseJsonObject('{"genre":"jazz"}')).toEqual({ genre: 'jazz' });
    expect(parseJsonObject('Sure!\n```json\n{"genre":"jazz"}\n```')).toEqual({ genre: 'jazz' });
    expect(parseJsonObject('[1,2]')).toBeNull();
    expect(parseJsonObject('no json here')).toBeNull();
  });
});
