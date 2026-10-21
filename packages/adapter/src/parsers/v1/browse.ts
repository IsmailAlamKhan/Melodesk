/**
 * Generic browse pages: home, explore, charts, new releases, moods, categories, library tabs,
 * and the artist/album/playlist detail pages (which add a header).
 */
import {
  parseEndpoint,
  parseMenu,
  parseServiceEndpoint,
  type Action,
  type Endpoint,
} from '../../innertube/endpoints';
import { arr, nav, obj, pickThumb, str, text, thumbnails } from '../../innertube/nav';
import {
  continuationOf,
  findSectionList,
  parseSectionList,
  parseShelf,
} from '../../innertube/shelves';
import { PageSchema, type Page, type PageHeader, type Shelf } from '../../schemas/items';
import { ParseError } from '../../errors';

function buttonAction(b: unknown): PageHeader['actions'][number] | null {
  const toggle = obj(nav(b, ['toggleButtonRenderer']));
  if (toggle) {
    // Never fall back to the icon's own name ("BOOKMARK_BORDER"): use YouTube's accessibility label.
    const label =
      text(toggle['defaultText']) ??
      str(nav(toggle, ['accessibilityData', 'accessibilityData', 'label'])) ??
      '';
    return {
      icon: str(nav(toggle, ['defaultIcon', 'iconType'])) ?? null,
      text: label,
      action:
        parseServiceEndpoint(toggle['defaultServiceEndpoint']) ??
        parseServiceEndpoint(toggle['defaultNavigationEndpoint']),
      toggledAction:
        parseServiceEndpoint(toggle['toggledServiceEndpoint']) ??
        parseServiceEndpoint(toggle['toggledNavigationEndpoint']),
      isToggled: toggle['isToggled'] === true,
    };
  }
  const btn = obj(nav(b, ['buttonRenderer']));
  if (btn) {
    const label = text(btn['text']) ?? '';
    const action =
      parseServiceEndpoint(btn['serviceEndpoint']) ??
      parseServiceEndpoint(btn['navigationEndpoint']) ??
      parseServiceEndpoint(btn['command']);
    return {
      icon: str(nav(btn, ['icon', 'iconType'])) ?? null,
      text: label,
      action,
      toggledAction: null,
      isToggled: false,
    };
  }
  const like = obj(nav(b, ['likeButtonRenderer']));
  if (like) {
    const status = str(like['likeStatus']);
    const target = obj(like['target']) ?? {};
    const mk = (s: 'LIKE' | 'DISLIKE' | 'INDIFFERENT'): Action => ({
      type: 'like',
      status: s,
      target: {
        ...(str(target['videoId']) ? { videoId: str(target['videoId']) } : {}),
        ...(str(target['playlistId']) ? { playlistId: str(target['playlistId']) } : {}),
      },
    });
    return {
      icon: 'LIKE',
      text: 'Like',
      action: mk('LIKE'),
      toggledAction: mk('INDIFFERENT'),
      isToggled: status === 'LIKE',
    };
  }
  return null;
}

const emptyHeader = (title: string): PageHeader => ({
  title,
  subtitle: null,
  secondSubtitle: null,
  description: null,
  thumbnails: [],
  playEndpoint: null,
  shuffleEndpoint: null,
  radioEndpoint: null,
  actions: [],
  menu: [],
  channelId: null,
  playlistId: null,
  isEditable: false,
  privacy: null,
  subscribed: null,
  likeStatus: null,
});

function parseHeader(response: unknown): PageHeader | null {
  // Artist: musicImmersiveHeaderRenderer / musicVisualHeaderRenderer
  const immersive =
    obj(nav(response, ['header', 'musicImmersiveHeaderRenderer'])) ??
    obj(nav(response, ['header', 'musicVisualHeaderRenderer']));
  if (immersive) {
    const sub = obj(nav(immersive, ['subscriptionButton', 'subscribeButtonRenderer']));
    const subscribeAction =
      arr(sub?.['serviceEndpoints'])
        .map(parseServiceEndpoint)
        .find((a) => a?.type === 'subscribe') ?? null;
    const unsubscribeAction =
      arr(sub?.['serviceEndpoints'])
        .map(parseServiceEndpoint)
        .find((a) => a?.type === 'unsubscribe') ?? null;
    const h = emptyHeader(text(immersive['title']) ?? '');
    h.description = text(immersive['description']) ?? null;
    h.subtitle =
      text(immersive['monthlyListenerCount']) ??
      text(nav(sub, ['longSubscriberCountText'])) ??
      null;
    h.thumbnails = thumbnails(immersive['thumbnail']);
    h.shuffleEndpoint = parseEndpoint(
      nav(immersive, ['playButton', 'buttonRenderer', 'navigationEndpoint']),
    );
    h.playEndpoint = h.shuffleEndpoint;
    h.radioEndpoint = parseEndpoint(
      nav(immersive, ['startRadioButton', 'buttonRenderer', 'navigationEndpoint']),
    );
    h.channelId = str(sub?.['channelId']) ?? null;
    h.subscribed = sub ? sub['subscribed'] === true : null;
    if (sub) {
      h.actions.push({
        icon: 'SUBSCRIBE',
        text: text(nav(sub, ['subscribedButtonText'])) ?? 'Subscribe',
        action: subscribeAction,
        toggledAction: unsubscribeAction,
        isToggled: sub['subscribed'] === true,
      });
    }
    const share = parseServiceEndpoint(immersive['shareEndpoint']);
    if (share)
      h.menu.push({ icon: 'SHARE', text: 'Share', navigate: null, action: share, toggled: null });
    return h;
  }
  // Album / playlist: musicResponsiveHeaderRenderer lives inside the primary tab's section list,
  // or musicDetailHeaderRenderer / musicEditablePlaylistDetailHeaderRenderer in `header`.
  const detailWrapper = nav(response, ['header', 'musicEditablePlaylistDetailHeaderRenderer']);
  const detail =
    obj(nav(detailWrapper, ['header', 'musicDetailHeaderRenderer'])) ??
    obj(nav(detailWrapper, ['header', 'musicResponsiveHeaderRenderer'])) ??
    obj(nav(response, ['header', 'musicDetailHeaderRenderer']));
  const primaryTab = nav(response, [
    'contents',
    'twoColumnBrowseResultsRenderer',
    'tabs',
    0,
    'tabRenderer',
    'content',
    'sectionListRenderer',
    'contents',
  ]);
  const responsive = obj(
    arr(primaryTab)
      .map(
        (c) =>
          nav(c, ['musicResponsiveHeaderRenderer']) ??
          nav(c, [
            'musicEditablePlaylistDetailHeaderRenderer',
            'header',
            'musicResponsiveHeaderRenderer',
          ]),
      )
      .find(Boolean),
  );
  const r = responsive ?? detail;
  if (r) {
    const h = emptyHeader(text(r['title']) ?? '');
    h.subtitle = text(r['subtitle']) ?? text(r['straplineTextOne']) ?? null;
    h.secondSubtitle = text(r['secondSubtitle']) ?? null;
    h.description =
      text(nav(r, ['description', 'musicDescriptionShelfRenderer', 'description'])) ??
      text(r['description']) ??
      null;
    h.thumbnails = thumbnails(r['thumbnail']);
    const buttons = arr(r['buttons']);
    for (const b of buttons) {
      const play = parseEndpoint(nav(b, ['musicPlayButtonRenderer', 'playNavigationEndpoint']));
      if (play) {
        h.playEndpoint = play;
        continue;
      }
      const menu = nav(b, ['menuRenderer']);
      if (menu) {
        h.menu.push(...parseMenu(b));
        continue;
      }
      const a = buttonAction(b);
      if (a) h.actions.push(a);
    }
    if (!responsive) {
      h.menu.push(...parseMenu(r['menu']));
      h.playEndpoint =
        h.playEndpoint ??
        parseEndpoint(nav(r, ['playButton', 'buttonRenderer', 'navigationEndpoint']));
    }
    h.shuffleEndpoint = h.menu.find((m) => m.icon === 'MUSIC_SHUFFLE')?.navigate ?? null;
    h.radioEndpoint = h.menu.find((m) => m.icon === 'MIX')?.navigate ?? null;
    const like = h.actions.find((a) => a.icon === 'LIKE');
    h.likeStatus = like ? (like.isToggled ? 'LIKE' : 'INDIFFERENT') : null;
    const bookmark = h.actions.find(
      (a) => a.action?.type === 'like' || a.toggledAction?.type === 'like',
    );
    const playlistTarget =
      (bookmark?.action?.type === 'like' ? bookmark.action.target.playlistId : undefined) ??
      (bookmark?.toggledAction?.type === 'like'
        ? bookmark.toggledAction.target.playlistId
        : undefined);
    h.playlistId =
      playlistTarget ??
      (h.playEndpoint?.type === 'watch'
        ? (h.playEndpoint.playlistId ?? null)
        : h.playEndpoint?.type === 'watchPlaylist'
          ? h.playEndpoint.playlistId
          : null);
    const editHeader =
      obj(nav(detailWrapper, ['editHeader', 'musicPlaylistEditHeaderRenderer'])) ??
      obj(
        arr(primaryTab)
          .map((c) =>
            nav(c, [
              'musicEditablePlaylistDetailHeaderRenderer',
              'editHeader',
              'musicPlaylistEditHeaderRenderer',
            ]),
          )
          .find(Boolean),
      );
    const privacy = str(editHeader?.['privacy']);
    h.privacy =
      privacy === 'PUBLIC' || privacy === 'PRIVATE' || privacy === 'UNLISTED' ? privacy : null;
    h.isEditable =
      !!detailWrapper ||
      !!nav(r, ['editHeader']) ||
      arr(primaryTab).some((c) => !!nav(c, ['musicEditablePlaylistDetailHeaderRenderer']));
    return h;
  }
  // Simple titled pages (Charts, Moods & genres, Library)
  const simple = text(nav(response, ['header', 'musicHeaderRenderer', 'title']));
  if (simple) return emptyHeader(simple);
  return null;
}

export function parseBrowsePage(response: unknown): Page {
  const sectionList = findSectionList(response);
  if (!sectionList) throw new ParseError('browse', 'no sectionListRenderer found');
  const parsed = parseSectionList(sectionList);
  const header = parseHeader(response);
  // Two-column pages put the description/track list in the primary tab too; merge any shelves there.
  const primary = nav(response, [
    'contents',
    'twoColumnBrowseResultsRenderer',
    'tabs',
    0,
    'tabRenderer',
    'content',
    'sectionListRenderer',
  ]);
  if (primary && primary !== sectionList) {
    const extra = parseSectionList(primary);
    parsed.shelves.push(...extra.shelves);
    parsed.unknownRenderers.push(...extra.unknownRenderers);
  }
  // Long track lists (playlists, liked songs) carry their continuation on the section list.
  const trackShelf = parsed.shelves.find((s) => s.id.startsWith('tracks') || s.layout === 'list');
  if (
    parsed.continuation &&
    trackShelf &&
    !trackShelf.continuation &&
    parsed.shelves.length === 1
  ) {
    trackShelf.continuation = parsed.continuation;
    parsed.continuation = null;
  }
  const bg = pickThumb(thumbnails(nav(response, ['background'])), 1000);
  return PageSchema.parse({
    header,
    chips: parsed.chips,
    shelves: parsed.shelves,
    continuation: parsed.continuation,
    unknownRenderers: parsed.unknownRenderers,
    background: bg,
  });
}

/** Continuation responses for section lists (home feed scrolling) or single shelves (long playlists). */
export function parseContinuation(response: unknown): {
  shelves: Shelf[];
  continuation: string | null;
  unknownRenderers: string[];
} {
  const unknown: string[] = [];
  const sectionCont = nav(response, ['continuationContents', 'sectionListContinuation']);
  if (sectionCont) {
    const p = parseSectionList(sectionCont);
    return {
      shelves: p.shelves,
      continuation: p.continuation,
      unknownRenderers: p.unknownRenderers,
    };
  }
  const shelfCont =
    obj(nav(response, ['continuationContents', 'musicPlaylistShelfContinuation'])) ??
    obj(nav(response, ['continuationContents', 'musicShelfContinuation'])) ??
    obj(nav(response, ['continuationContents', 'gridContinuation']));
  if (shelfCont) {
    const s = parseShelf(
      {
        musicShelfRenderer: { ...shelfCont, contents: shelfCont['contents'] ?? shelfCont['items'] },
      },
      unknown,
    );
    return {
      shelves: s ? [s] : [],
      continuation: continuationOf(shelfCont),
      unknownRenderers: unknown,
    };
  }
  // Newer: onResponseReceivedActions[].appendContinuationItemsAction.continuationItems
  const actions = arr(nav(response, ['onResponseReceivedActions']));
  const shelves: Shelf[] = [];
  let continuation: string | null = null;
  for (const a of actions) {
    const items = arr(nav(a, ['appendContinuationItemsAction', 'continuationItems']));
    const list = { contents: items };
    const p = parseSectionList(list);
    shelves.push(...p.shelves);
    unknown.push(...p.unknownRenderers);
    continuation = p.continuation ?? continuation;
    // bare items (playlist continuation) → one shelf
    if (!p.shelves.length) {
      const s = parseShelf({ musicShelfRenderer: { contents: items } }, unknown);
      if (s?.items.length) shelves.push(s);
    }
  }
  return { shelves, continuation, unknownRenderers: unknown };
}

export type { Endpoint };
