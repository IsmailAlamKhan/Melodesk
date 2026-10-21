/** Track lists the way pages show them: the item type and a stable sort. */
import type { Item } from '@melodesk/adapter';

export type Track = Extract<Item, { kind: 'song' | 'video' }>;
export type SortKey = 'title' | 'artist' | 'album' | 'duration';

export function sortTracks(tracks: Track[], key: SortKey, dir: 'asc' | 'desc'): Track[] {
  const value = (t: Track): string | number =>
    key === 'title'
      ? t.title
      : key === 'artist'
        ? (t.artists[0]?.name ?? '')
        : key === 'album'
          ? (t.album?.name ?? '')
          : (t.durationSeconds ?? 0);
  const sorted = [...tracks].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true });
  });
  return dir === 'asc' ? sorted : sorted.reverse();
}

/** A view-only sort applied by a page (null means YouTube's own order). */
export interface ViewSort {
  key: SortKey;
  dir: 'asc' | 'desc';
}
