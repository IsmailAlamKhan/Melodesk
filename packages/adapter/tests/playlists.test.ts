import { describe, expect, it } from 'vitest';
import { parseAddToPlaylistOptions, parseCreatePlaylist, parseLyrics } from '../src';

describe('add-to-playlist options', () => {
  it('parses playlist options with containment state', () => {
    const res = {
      contents: [
        {
          addToPlaylistRenderer: {
            playlists: [
              {
                playlistAddToOptionRenderer: {
                  playlistId: 'PL1',
                  title: { runs: [{ text: 'Gym' }] },
                  containsSelectedVideos: 'ALL',
                  privacy: 'PRIVATE',
                },
              },
              {
                playlistAddToOptionRenderer: {
                  playlistId: 'PL2',
                  title: { runs: [{ text: 'Chill' }] },
                  containsSelectedVideos: 'NONE',
                },
              },
            ],
          },
        },
      ],
    };
    expect(parseAddToPlaylistOptions(res)).toEqual([
      {
        playlistId: 'PL1',
        title: 'Gym',
        contains: 'ALL',
        privacy: 'PRIVATE',
        description: null,
        artworkUrl: null,
      },
      {
        playlistId: 'PL2',
        title: 'Chill',
        contains: 'NONE',
        privacy: null,
        description: null,
        artworkUrl: null,
      },
    ]);
  });
  it('parses the create response', () => {
    expect(parseCreatePlaylist({ playlistId: 'PLnew' })).toBe('PLnew');
    expect(() => parseCreatePlaylist({})).toThrow();
  });
});

describe('lyrics', () => {
  it('parses plain lyrics', () => {
    const res = {
      contents: {
        sectionListRenderer: {
          contents: [
            {
              musicDescriptionShelfRenderer: {
                description: { runs: [{ text: 'la la' }] },
                footer: { runs: [{ text: 'Source: X' }] },
              },
            },
          ],
        },
      },
    };
    expect(parseLyrics(res)).toEqual({ text: 'la la', source: 'Source: X', synced: null });
  });
  it('parses timed lyrics', () => {
    const res = {
      contents: {
        elementRenderer: {
          newElement: {
            type: {
              componentType: {
                model: {
                  timedLyricsModel: {
                    lyricsData: {
                      timedLyricsData: [
                        {
                          lyricLine: 'first',
                          cueRange: { startTimeMilliseconds: '1000', endTimeMilliseconds: '2000' },
                        },
                        {
                          lyricLine: 'second',
                          cueRange: { startTimeMilliseconds: '2000', endTimeMilliseconds: '3000' },
                        },
                      ],
                      sourceMessage: 'Source: Y',
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const l = parseLyrics(res);
    expect(l.synced?.map((s) => s.text)).toEqual(['first', 'second']);
    expect(l.synced?.[0]?.startMs).toBe(1000);
    expect(l.source).toBe('Source: Y');
  });
  it('reports no lyrics', () => {
    expect(
      parseLyrics({
        contents: { messageRenderer: { text: { runs: [{ text: 'Lyrics not available' }] } } },
      }).text,
    ).toBeNull();
  });
});
