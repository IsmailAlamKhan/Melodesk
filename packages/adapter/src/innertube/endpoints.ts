import { z } from 'zod';
import { arr, isObject, nav, obj, str, type JsonObject } from './nav';

/**
 * Endpoints are how InnerTube says "what happens when you tap this". We keep the raw object
 * (so it can be handed back to the page for playback, which keeps YouTube's own queue logic)
 * and derive a small typed view for our UI's routing.
 */
export const WatchEndpointSchema = z.object({
  type: z.literal('watch'),
  videoId: z.string().optional(),
  playlistId: z.string().optional(),
  params: z.string().optional(),
  index: z.number().int().optional(),
  playlistSetVideoId: z.string().optional(),
});
export const WatchPlaylistEndpointSchema = z.object({
  type: z.literal('watchPlaylist'),
  playlistId: z.string(),
  params: z.string().optional(),
});
export const BrowseEndpointSchema = z.object({
  type: z.literal('browse'),
  browseId: z.string(),
  params: z.string().optional(),
  pageType: z.string().optional(),
});
export const SearchEndpointSchema = z.object({
  type: z.literal('search'),
  query: z.string(),
  params: z.string().optional(),
});
export const UrlEndpointSchema = z.object({ type: z.literal('url'), url: z.string() });
export const SignInEndpointSchema = z.object({ type: z.literal('signIn') });
export const EndpointSchema = z.discriminatedUnion('type', [
  WatchEndpointSchema,
  WatchPlaylistEndpointSchema,
  BrowseEndpointSchema,
  SearchEndpointSchema,
  UrlEndpointSchema,
  SignInEndpointSchema,
]);
export type Endpoint = z.infer<typeof EndpointSchema>;
export type BrowseEndpoint = z.infer<typeof BrowseEndpointSchema>;
export type WatchEndpoint = z.infer<typeof WatchEndpointSchema>;

/** Page types YouTube Music annotates browse endpoints with. */
export const PAGE_TYPES = {
  MUSIC_PAGE_TYPE_ARTIST: 'artist',
  MUSIC_PAGE_TYPE_ALBUM: 'album',
  MUSIC_PAGE_TYPE_PLAYLIST: 'playlist',
  MUSIC_PAGE_TYPE_USER_CHANNEL: 'user',
  MUSIC_PAGE_TYPE_PODCAST_SHOW_DETAIL_PAGE: 'podcast',
  MUSIC_PAGE_TYPE_NON_MUSIC_AUDIO_TRACK_PAGE: 'episode',
} as const;

export function parseEndpoint(raw: unknown): Endpoint | null {
  if (!isObject(raw)) return null;
  const watch = obj(raw['watchEndpoint']);
  if (watch) {
    const index = watch['index'];
    return {
      type: 'watch',
      ...(str(watch['videoId']) !== undefined ? { videoId: str(watch['videoId']) } : {}),
      ...(str(watch['playlistId']) !== undefined ? { playlistId: str(watch['playlistId']) } : {}),
      ...(str(watch['params']) !== undefined ? { params: str(watch['params']) } : {}),
      ...(typeof index === 'number' ? { index } : {}),
      ...(str(watch['playlistSetVideoId']) !== undefined
        ? { playlistSetVideoId: str(watch['playlistSetVideoId']) }
        : {}),
    };
  }
  const wp = obj(raw['watchPlaylistEndpoint']);
  if (wp && str(wp['playlistId'])) {
    return {
      type: 'watchPlaylist',
      playlistId: str(wp['playlistId']) ?? '',
      ...(str(wp['params']) !== undefined ? { params: str(wp['params']) } : {}),
    };
  }
  const browse = obj(raw['browseEndpoint']);
  if (browse && str(browse['browseId'])) {
    const pageType = str(
      nav(browse, [
        'browseEndpointContextSupportedConfigs',
        'browseEndpointContextMusicConfig',
        'pageType',
      ]),
    );
    return {
      type: 'browse',
      browseId: str(browse['browseId']) ?? '',
      ...(str(browse['params']) !== undefined ? { params: str(browse['params']) } : {}),
      ...(pageType !== undefined ? { pageType } : {}),
    };
  }
  const search = obj(raw['searchEndpoint']);
  if (search && str(search['query']) !== undefined) {
    return {
      type: 'search',
      query: str(search['query']) ?? '',
      ...(str(search['params']) !== undefined ? { params: str(search['params']) } : {}),
    };
  }
  const url = str(nav(raw, ['urlEndpoint', 'url']));
  if (url) return { type: 'url', url };
  if (raw['signInEndpoint'] || nav(raw, ['modalEndpoint'])) return { type: 'signIn' };
  return null;
}

/** First endpoint found in a `{runs:[...]}` text, e.g. an artist link in a subtitle. */
export function endpointFromRuns(v: unknown): Endpoint | null {
  for (const r of arr(nav(v, ['runs']))) {
    const ep = parseEndpoint(nav(r, ['navigationEndpoint']));
    if (ep) return ep;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Service endpoints (actions that mutate the account) and menu items
// ---------------------------------------------------------------------------

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('like'),
    /** Status to set when activated. */
    status: z.enum(['LIKE', 'DISLIKE', 'INDIFFERENT']),
    target: z.object({ videoId: z.string().optional(), playlistId: z.string().optional() }),
  }),
  z.object({
    type: z.literal('queueAdd'),
    position: z.enum(['INSERT_AFTER_CURRENT_VIDEO', 'INSERT_AT_END']),
    target: z.object({ videoId: z.string().optional(), playlistId: z.string().optional() }),
    toast: z.string().optional(),
  }),
  z.object({
    type: z.literal('subscribe'),
    channelIds: z.array(z.string()),
    params: z.string().optional(),
  }),
  z.object({ type: z.literal('unsubscribe'), channelIds: z.array(z.string()) }),
  z.object({
    type: z.literal('feedback'),
    feedbackToken: z.string(),
    toast: z.string().optional(),
  }),
  z.object({
    type: z.literal('playlistEdit'),
    playlistId: z.string(),
    actions: z.array(z.record(z.string(), z.unknown())),
  }),
  z.object({ type: z.literal('deletePlaylist'), playlistId: z.string() }),
  z.object({ type: z.literal('share'), serializedShareEntity: z.string() }),
  z.object({
    type: z.literal('addToPlaylist'),
    videoId: z.string().optional(),
    playlistId: z.string().optional(),
  }),
  z.object({ type: z.literal('signInRequired') }),
]);
export type Action = z.infer<typeof ActionSchema>;

function toastText(commands: unknown): string | undefined {
  for (const c of arr(commands)) {
    const t =
      str(
        nav(c, [
          'addToToastAction',
          'item',
          'notificationTextRenderer',
          'successResponseText',
          'runs',
          0,
          'text',
        ]),
      ) ??
      str(
        nav(c, [
          'openPopupAction',
          'popup',
          'notificationActionRenderer',
          'responseText',
          'runs',
          0,
          'text',
        ]),
      );
    if (t) return t;
  }
  return undefined;
}

export function parseServiceEndpoint(raw: unknown): Action | null {
  if (!isObject(raw)) return null;
  const like = obj(raw['likeEndpoint']);
  if (like) {
    const status = str(like['status']);
    const target = obj(like['target']) ?? {};
    if (status === 'LIKE' || status === 'DISLIKE' || status === 'INDIFFERENT') {
      return {
        type: 'like',
        status,
        target: {
          ...(str(target['videoId']) !== undefined ? { videoId: str(target['videoId']) } : {}),
          ...(str(target['playlistId']) !== undefined
            ? { playlistId: str(target['playlistId']) }
            : {}),
        },
      };
    }
  }
  const q = obj(raw['queueAddEndpoint']);
  if (q) {
    const pos = str(q['queueInsertPosition']);
    const target = obj(q['queueTarget']) ?? {};
    const toast = toastText(q['commands']);
    return {
      type: 'queueAdd',
      position:
        pos === 'INSERT_AFTER_CURRENT_VIDEO' ? 'INSERT_AFTER_CURRENT_VIDEO' : 'INSERT_AT_END',
      target: {
        ...(str(target['videoId']) !== undefined ? { videoId: str(target['videoId']) } : {}),
        ...(str(target['playlistId']) !== undefined
          ? { playlistId: str(target['playlistId']) }
          : {}),
      },
      ...(toast !== undefined ? { toast } : {}),
    };
  }
  const sub = obj(raw['subscribeEndpoint']);
  if (sub) {
    return {
      type: 'subscribe',
      channelIds: arr(sub['channelIds']).filter((x): x is string => typeof x === 'string'),
      ...(str(sub['params']) !== undefined ? { params: str(sub['params']) } : {}),
    };
  }
  const unsub = obj(raw['unsubscribeEndpoint']);
  if (unsub) {
    return {
      type: 'unsubscribe',
      channelIds: arr(unsub['channelIds']).filter((x): x is string => typeof x === 'string'),
    };
  }
  const fb = obj(raw['feedbackEndpoint']);
  if (fb && str(fb['feedbackToken'])) {
    const toast = toastText(fb['actions']);
    return {
      type: 'feedback',
      feedbackToken: str(fb['feedbackToken']) ?? '',
      ...(toast !== undefined ? { toast } : {}),
    };
  }
  const pe = obj(raw['playlistEditEndpoint']);
  if (pe && str(pe['playlistId'])) {
    return {
      type: 'playlistEdit',
      playlistId: str(pe['playlistId']) ?? '',
      actions: arr(pe['actions']).filter(isObject),
    };
  }
  const del = obj(raw['deletePlaylistEndpoint']);
  if (del && str(del['playlistId']))
    return { type: 'deletePlaylist', playlistId: str(del['playlistId']) ?? '' };
  const share = obj(raw['shareEntityEndpoint']);
  if (share && str(share['serializedShareEntity'])) {
    return { type: 'share', serializedShareEntity: str(share['serializedShareEntity']) ?? '' };
  }
  const atp = obj(raw['addToPlaylistEndpoint']);
  if (atp) {
    return {
      type: 'addToPlaylist',
      ...(str(atp['videoId']) !== undefined ? { videoId: str(atp['videoId']) } : {}),
      ...(str(atp['playlistId']) !== undefined ? { playlistId: str(atp['playlistId']) } : {}),
    };
  }
  // Confirmation dialogs wrap the real endpoint (e.g. unsubscribe).
  const confirm = nav(raw, ['signalServiceEndpoint', 'actions']);
  for (const a of arr(confirm)) {
    const inner = parseServiceEndpoint(
      nav(a, [
        'openPopupAction',
        'popup',
        'confirmDialogRenderer',
        'confirmButton',
        'buttonRenderer',
        'serviceEndpoint',
      ]),
    );
    if (inner) return inner;
  }
  if (raw['modalEndpoint'] || raw['signInEndpoint']) return { type: 'signInRequired' };
  return null;
}

export const MenuItemSchema = z.object({
  icon: z.string().nullable(),
  text: z.string(),
  /** Exactly one of these is set. */
  navigate: EndpointSchema.nullable(),
  action: ActionSchema.nullable(),
  /** For toggle items (save/unsave): the alternate state. */
  toggled: z
    .object({
      icon: z.string().nullable(),
      text: z.string(),
      action: ActionSchema.nullable(),
      isToggled: z.boolean(),
    })
    .nullable(),
});
export type MenuItem = z.infer<typeof MenuItemSchema>;

/** Parse a `menuRenderer` (context menu) into typed items; unknown items are skipped. */
export function parseMenu(menu: unknown): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of arr(nav(menu, ['menuRenderer', 'items']))) {
    const navItem = obj(nav(item, ['menuNavigationItemRenderer']));
    const svc = obj(nav(item, ['menuServiceItemRenderer']));
    const toggle = obj(nav(item, ['toggleMenuServiceItemRenderer']));
    if (navItem) {
      const label = str(nav(navItem, ['text', 'runs', 0, 'text']));
      if (!label) continue;
      const ep = navItem['navigationEndpoint'];
      const action = parseServiceEndpoint(ep);
      const navigate = action ? null : parseEndpoint(ep);
      out.push({
        icon: str(nav(navItem, ['icon', 'iconType'])) ?? null,
        text: label,
        navigate,
        action,
        toggled: null,
      });
    } else if (svc) {
      const label = str(nav(svc, ['text', 'runs', 0, 'text']));
      if (!label) continue;
      out.push({
        icon: str(nav(svc, ['icon', 'iconType'])) ?? null,
        text: label,
        navigate: null,
        action: parseServiceEndpoint(svc['serviceEndpoint']),
        toggled: null,
      });
    } else if (toggle) {
      const label = str(nav(toggle, ['defaultText', 'runs', 0, 'text']));
      const toggledLabel = str(nav(toggle, ['toggledText', 'runs', 0, 'text']));
      if (!label) continue;
      out.push({
        icon: str(nav(toggle, ['defaultIcon', 'iconType'])) ?? null,
        text: label,
        navigate: null,
        action: parseServiceEndpoint(toggle['defaultServiceEndpoint']),
        toggled: {
          icon: str(nav(toggle, ['toggledIcon', 'iconType'])) ?? null,
          text: toggledLabel ?? label,
          action: parseServiceEndpoint(toggle['toggledServiceEndpoint']),
          isToggled: toggle['isToggled'] === true,
        },
      });
    }
  }
  return out;
}

export type { JsonObject };
