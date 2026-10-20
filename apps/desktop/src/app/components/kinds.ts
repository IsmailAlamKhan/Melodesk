import type { Item } from '@melodesk/adapter';
import type { MessageKey } from '../../i18n';

/** Translation key for the type name of an item (song, album, …). */
export const KIND_KEY: Record<Item['kind'], MessageKey> = {
  song: 'kind.song',
  video: 'kind.video',
  album: 'kind.album',
  playlist: 'kind.playlist',
  artist: 'kind.artist',
  podcast: 'kind.podcast',
  episode: 'kind.episode',
  category: 'kind.category',
  action: 'kind.action',
  generic: 'kind.generic',
};
