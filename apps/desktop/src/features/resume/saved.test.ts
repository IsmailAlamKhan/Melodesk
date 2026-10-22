import { describe, expect, it } from 'vitest';
import { endpointFor, endpointVideoId, worthResuming } from './saved';

describe('worthResuming', () => {
  it('skips the first seconds and the last seconds of a song', () => {
    expect(worthResuming(4, 200)).toBe(false);
    expect(worthResuming(60, 200)).toBe(true);
    expect(worthResuming(195, 200)).toBe(false);
  });
  it('works without a known length', () => {
    expect(worthResuming(30, 0)).toBe(true);
    expect(worthResuming(3, 0)).toBe(false);
  });
});

const watch = (videoId: string) => ({ watchEndpoint: { videoId, playlistId: 'RDx' } });
const item = (videoId: string) => ({ videoId, endpoint: watch(videoId) });

describe('endpointFor', () => {
  it('reads which song an endpoint plays', () => {
    expect(endpointVideoId(watch('a'))).toBe('a');
    expect(endpointVideoId({ browseEndpoint: {} })).toBeNull();
    expect(endpointVideoId(null)).toBeNull();
  });

  it('uses the queue item that is the song', () => {
    const queue = { items: [item('a'), item('b'), item('c')], index: 1 };
    expect(endpointFor('b', queue)).toEqual(watch('b'));
  });

  it('does not trust an index that lags behind the track', () => {
    const queue = { items: [item('a'), item('b'), item('c')], index: 0 };
    expect(endpointFor('c', queue)).toEqual(watch('c'));
  });

  it('gives nothing when the song is not in the queue, or its endpoint is for another song', () => {
    expect(endpointFor('z', { items: [item('a')], index: 0 })).toBeNull();
    expect(
      endpointFor('a', { items: [{ videoId: 'a', endpoint: watch('b') }], index: 0 }),
    ).toBeNull();
    expect(endpointFor('a', null)).toBeNull();
  });
});
