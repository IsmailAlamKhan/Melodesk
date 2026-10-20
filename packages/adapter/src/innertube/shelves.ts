/**
 * Shelf-level parsers: turn a `sectionListRenderer` (or any list of section wrappers) into
 * typed shelves, collecting unknown renderer names for the health check.
 */
import { parseEndpoint, parseMenu, type Endpoint } from './endpoints';
import { arr, nav, obj, rendererKey, runs, str, text, thumbnails } from './nav';
import { parseItem } from './renderers';
import type { Chip, Item, Shelf } from '../schemas/items';

export interface ParsedSections {
  shelves: Shelf[];
  chips: Chip[];
  continuation: string | null;
  unknownRenderers: string[];
}

const ITEM_RENDERERS = new Set([
  'musicTwoRowItemRenderer',
  'musicResponsiveListItemRenderer',
  'musicNavigationButtonRenderer',
  'playlistPanelVideoRenderer',
  'playlistPanelVideoWrapperRenderer',
  'musicMultiRowListItemRenderer',
]);

let shelfCounter = 0;
function shelfId(title: string, explicit?: string): string {
  shelfCounter += 1;
  return explicit ?? `${title.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}-${String(shelfCounter)}`;
}

function parseItems(list: unknown, unknown: string[]): Item[] {
  const items: Item[] = [];
  for (const w of arr(list)) {
    const { item, renderer } = parseItem(w);
    if (item) items.push(item);
    else if (renderer && renderer !== 'continuationItemRenderer') unknown.push(renderer);
  }
  return items;
}

/** Continuation token from the legacy `continuations[]` or the newer `continuationItemRenderer`. */
export function continuationOf(v: unknown): string | null {
  const legacy =
    str(nav(v, ['continuations', 0, 'nextContinuationData', 'continuation'])) ??
    str(nav(v, ['continuations', 0, 'reloadContinuationData', 'continuation']));
  if (legacy) return legacy;
  for (const c of arr(nav(v, ['contents']))) {
    const token = str(
      nav(c, ['continuationItemRenderer', 'continuationEndpoint', 'continuationCommand', 'token']),
    );
    if (token) return token;
  }
  return null;
}

function headerOf(shelf: unknown): {
  title: string;
  subtitle: string | null;
  more: Endpoint | null;
} {
  const basic = nav(shelf, ['header', 'musicCarouselShelfBasicHeaderRenderer']);
  const titleV =
    nav(basic, ['title']) ??
    nav(shelf, ['title']) ??
    nav(shelf, ['header', 'gridHeaderRenderer', 'title']);
  const title = text(titleV) ?? '';
  const subtitle = text(nav(basic, ['strapline'])) ?? text(nav(shelf, ['subtitle'])) ?? null;
  const more =
    parseEndpoint(nav(basic, ['moreContentButton', 'buttonRenderer', 'navigationEndpoint'])) ??
    parseEndpoint(nav(shelf, ['bottomEndpoint'])) ??
    parseEndpoint(runs(titleV)[0]?.endpoint) ??
    null;
  return { title, subtitle, more };
}

export function parseShelf(wrapper: unknown, unknown: string[]): Shelf | null {
  const key = rendererKey(wrapper);
  const r = key ? nav(wrapper, [key]) : undefined;
  if (!key || !r) return null;
  switch (key) {
    case 'musicCarouselShelfRenderer': {
      const h = headerOf(r);
      const items = parseItems(nav(r, ['contents']), unknown);
      const perColumn = Number.parseInt(str(nav(r, ['numItemsPerColumn'])) ?? '1', 10);
      return {
        id: shelfId(h.title, str(nav(r, ['shelfId']))),
        title: h.title,
        subtitle: h.subtitle,
        moreEndpoint: h.more,
        layout: perColumn > 1 ? 'list' : 'carousel',
        items,
        continuation: null,
      };
    }
    case 'musicShelfRenderer': {
      const h = headerOf(r);
      const items = parseItems(nav(r, ['contents']), unknown);
      if (!items.length && !h.title) return null;
      return {
        id: shelfId(h.title),
        title: h.title,
        subtitle: h.subtitle,
        moreEndpoint: h.more,
        layout: 'list',
        items,
        continuation: continuationOf(r),
      };
    }
    case 'musicPlaylistShelfRenderer': {
      const items = parseItems(nav(r, ['contents']), unknown);
      return {
        id: shelfId('tracks', str(nav(r, ['playlistId']))),
        title: '',
        subtitle: null,
        moreEndpoint: null,
        layout: 'list',
        items,
        continuation: continuationOf(r),
      };
    }
    case 'gridRenderer': {
      const h = headerOf(r);
      const items = parseItems(nav(r, ['items']), unknown);
      return {
        id: shelfId(h.title || 'grid'),
        title: h.title,
        subtitle: h.subtitle,
        moreEndpoint: h.more,
        layout: 'grid',
        items,
        continuation: continuationOf(r),
      };
    }
    case 'musicCardShelfRenderer': {
      // Search "Top result": the card itself is an item, plus a few related rows.
      const title = text(nav(r, ['title'])) ?? '';
      const endpoint =
        parseEndpoint(nav(r, ['onTap'])) ?? parseEndpoint(runs(nav(r, ['title']))[0]?.endpoint);
      const subtitle = text(nav(r, ['subtitle'])) ?? '';
      const items: Item[] = [];
      const card = cardAsItem(r, title, endpoint, subtitle);
      if (card) items.push(card);
      items.push(...parseItems(nav(r, ['contents']), unknown));
      return {
        id: shelfId('top-result'),
        title:
          text(nav(r, ['header', 'musicCardShelfHeaderBasicRenderer', 'title'])) ?? 'Top result',
        subtitle: null,
        moreEndpoint: null,
        layout: 'list',
        items,
        continuation: null,
      };
    }
    case 'itemSectionRenderer': {
      // Wrapper: either a single shelf inside, or bare items (newer search layout).
      const inner = arr(nav(r, ['contents']));
      const first = inner[0];
      if (
        first &&
        parseItem(first).renderer &&
        ITEM_RENDERERS.has(parseItem(first).renderer ?? '')
      ) {
        return {
          id: shelfId('items'),
          title: '',
          subtitle: null,
          moreEndpoint: null,
          layout: 'list',
          items: parseItems(inner, unknown),
          continuation: null,
        };
      }
      for (const w of inner) {
        const s = parseShelf(w, unknown);
        if (s) return s;
      }
      return null;
    }
    case 'musicDescriptionShelfRenderer':
    case 'musicTastebuilderShelfRenderer':
    case 'musicResponsiveHeaderRenderer':
    case 'musicEditablePlaylistDetailHeaderRenderer':
    case 'musicShelfDividerRenderer':
      return null; // handled elsewhere or intentionally ignored
    default:
      unknown.push(key);
      return null;
  }
}

function cardAsItem(
  r: unknown,
  title: string,
  endpoint: Endpoint | null,
  subtitle: string,
): Item | null {
  if (!title) return null;
  const thumbs = thumbnails(nav(r, ['thumbnail']));
  const menu = parseMenu(nav(r, ['menu']));
  const buttons = arr(nav(r, ['buttons'])).map(
    (b) =>
      parseEndpoint(nav(b, ['buttonRenderer', 'command'])) ??
      parseEndpoint(nav(b, ['buttonRenderer', 'navigationEndpoint'])),
  );
  const playEndpoint =
    buttons.find((b) => b?.type === 'watch' || b?.type === 'watchPlaylist') ??
    parseEndpoint(
      nav(r, [
        'thumbnailOverlay',
        'musicItemThumbnailOverlayRenderer',
        'content',
        'musicPlayButtonRenderer',
        'playNavigationEndpoint',
      ]),
    ) ??
    null;
  const firstWord = subtitle.split('•')[0]?.trim().toLowerCase();
  const common = {
    title,
    thumbnails: thumbs,
    endpoint,
    playEndpoint,
    menu,
    subtitle,
    isExplicit: false,
  };
  if (endpoint?.type === 'browse') {
    const id = endpoint.browseId;
    if (id.startsWith('UC') || firstWord === 'artist')
      return {
        ...common,
        kind: 'artist',
        key: `artist:${id}`,
        browseId: id,
        description: subtitle || null,
        subscribed: null,
      };
    if (
      id.startsWith('MPRE') ||
      firstWord === 'album' ||
      firstWord === 'single' ||
      firstWord === 'ep'
    )
      return {
        ...common,
        kind: 'album',
        key: `album:${id}`,
        browseId: id,
        artists: [],
        year: null,
        albumType: null,
        playlistId: playEndpoint?.type === 'watchPlaylist' ? playEndpoint.playlistId : null,
      };
    if (id.startsWith('VL'))
      return {
        ...common,
        kind: 'playlist',
        key: `playlist:${id}`,
        browseId: id,
        playlistId: id.slice(2),
        author: null,
        description: subtitle || null,
      };
    if (id.startsWith('MPSP'))
      return { ...common, kind: 'podcast', key: `podcast:${id}`, browseId: id, author: null };
  }
  if (endpoint?.type === 'watch' && endpoint.videoId) {
    return {
      ...common,
      kind: firstWord === 'video' ? 'video' : 'song',
      key: `song:${endpoint.videoId}`,
      videoId: endpoint.videoId,
      artists: [],
      album: null,
      durationSeconds: null,
      stat: null,
      likeStatus: null,
      setVideoId: null,
      feedbackTokens: null,
      views: null,
    };
  }
  return { ...common, kind: 'generic', key: `generic:${title}`, lines: [subtitle] };
}

export function parseChips(v: unknown): Chip[] {
  const out: Chip[] = [];
  for (const c of arr(nav(v, ['chipCloudRenderer', 'chips']))) {
    const r = obj(nav(c, ['chipCloudChipRenderer']));
    if (!r) continue;
    const label = text(r['text']);
    if (!label) continue;
    out.push({
      text: label,
      endpoint: parseEndpoint(r['navigationEndpoint']),
      isSelected: r['isSelected'] === true,
    });
  }
  return out;
}

/** Parse a `sectionListRenderer` object. */
export function parseSectionList(sectionList: unknown): ParsedSections {
  const unknown: string[] = [];
  const shelves: Shelf[] = [];
  for (const w of arr(nav(sectionList, ['contents']))) {
    const s = parseShelf(w, unknown);
    if (s) shelves.push(s);
  }
  return {
    shelves,
    chips: parseChips(nav(sectionList, ['header'])),
    continuation: continuationOf(sectionList),
    unknownRenderers: unknown,
  };
}

/** Find the section list in the usual single-column / two-column browse shapes. */
export function findSectionList(response: unknown): unknown {
  return (
    nav(response, [
      'contents',
      'singleColumnBrowseResultsRenderer',
      'tabs',
      0,
      'tabRenderer',
      'content',
      'sectionListRenderer',
    ]) ??
    nav(response, [
      'contents',
      'twoColumnBrowseResultsRenderer',
      'secondaryContents',
      'sectionListRenderer',
    ]) ??
    nav(response, [
      'contents',
      'tabbedSearchResultsRenderer',
      'tabs',
      0,
      'tabRenderer',
      'content',
      'sectionListRenderer',
    ]) ??
    nav(response, ['contents', 'sectionListRenderer']) ??
    nav(response, ['continuationContents', 'sectionListContinuation']) ??
    undefined
  );
}
