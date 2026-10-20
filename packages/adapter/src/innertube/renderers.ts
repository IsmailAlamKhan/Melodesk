/**
 * Item-level renderer parsers. Each returns an `Item` or null when the renderer is not an
 * item we understand. They never throw.
 */
import {
  endpointFromRuns,
  parseEndpoint,
  parseMenu,
  type Endpoint,
  type MenuItem,
} from './endpoints';
import {
  arr,
  nav,
  obj,
  parseDuration,
  runs,
  splitRuns,
  str,
  text,
  thumbnails,
  type Run,
} from './nav';
import { PAGE_TYPES } from './endpoints';
import type { Item, LikeStatus, Link, SongItem, Thumbnail, VideoItem } from '../schemas/items';

function asLikeStatus(v: string | undefined): LikeStatus | null {
  return v === 'LIKE' || v === 'DISLIKE' || v === 'INDIFFERENT' ? v : null;
}

function link(r: Run | undefined): Link | null {
  if (!r) return null;
  return { name: r.text, endpoint: parseEndpoint(r.endpoint) };
}

function isExplicit(renderer: unknown): boolean {
  const badges = [...arr(nav(renderer, ['badges'])), ...arr(nav(renderer, ['subtitleBadges']))];
  return badges.some(
    (b) => str(nav(b, ['musicInlineBadgeRenderer', 'icon', 'iconType'])) === 'MUSIC_EXPLICIT_BADGE',
  );
}

function playEndpointOf(renderer: unknown): Endpoint | null {
  return (
    parseEndpoint(
      nav(renderer, [
        'overlay',
        'musicItemThumbnailOverlayRenderer',
        'content',
        'musicPlayButtonRenderer',
        'playNavigationEndpoint',
      ]),
    ) ??
    parseEndpoint(
      nav(renderer, [
        'thumbnailOverlay',
        'musicItemThumbnailOverlayRenderer',
        'content',
        'musicPlayButtonRenderer',
        'playNavigationEndpoint',
      ]),
    )
  );
}

function keyOf(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(':');
}

/** Classify an item from its endpoint and subtitle words when there is no explicit type. */
function kindFromEndpoint(ep: Endpoint | null, firstWord: string | undefined): Item['kind'] | null {
  if (ep?.type === 'watch') return firstWord?.toLowerCase() === 'episode' ? 'episode' : 'song';
  if (ep?.type === 'watchPlaylist') return 'playlist';
  if (ep?.type === 'browse') {
    const pt = ep.pageType ? PAGE_TYPES[ep.pageType as keyof typeof PAGE_TYPES] : undefined;
    if (pt === 'artist' || pt === 'user') return 'artist';
    if (pt === 'album') return 'album';
    if (pt === 'playlist') return 'playlist';
    if (pt === 'podcast') return 'podcast';
    if (pt === 'episode') return 'episode';
    if (ep.browseId.startsWith('MPRE')) return 'album';
    if (ep.browseId.startsWith('VL')) return 'playlist';
    if (ep.browseId.startsWith('UC') || ep.browseId.startsWith('MPLA')) return 'artist';
    if (ep.browseId.startsWith('MPSP')) return 'podcast';
    if (ep.browseId.startsWith('FEmusic_')) return 'category';
  }
  const w = firstWord?.toLowerCase();
  if (w === 'album' || w === 'single' || w === 'ep') return 'album';
  if (w === 'playlist') return 'playlist';
  if (w === 'artist') return 'artist';
  if (w === 'song') return 'song';
  if (w === 'video') return 'video';
  if (w === 'podcast') return 'podcast';
  if (w === 'episode') return 'episode';
  return null;
}

const TYPE_WORDS = new Set([
  'song',
  'video',
  'album',
  'single',
  'ep',
  'playlist',
  'artist',
  'podcast',
  'episode',
  'profile',
]);

/** Carousel/grid tiles. */
export function parseTwoRowItem(r: unknown): Item | null {
  const title = text(nav(r, ['title']));
  if (!title) return null;
  const endpoint =
    parseEndpoint(nav(r, ['navigationEndpoint'])) ?? endpointFromRuns(nav(r, ['title']));
  const subtitleRuns = runs(nav(r, ['subtitle']));
  const groups = splitRuns(subtitleRuns);
  const subtitle = subtitleRuns.map((x) => x.text).join('');
  const thumbs = thumbnails(nav(r, ['thumbnailRenderer']));
  const menu = parseMenu(nav(r, ['menu']));
  const playEndpoint = playEndpointOf(r);
  const explicit = isExplicit(r);
  const firstWord = groups[0]?.[0]?.text;
  const kind = kindFromEndpoint(endpoint, firstWord);
  const common = {
    title,
    thumbnails: thumbs,
    endpoint,
    playEndpoint,
    menu,
    subtitle,
    isExplicit: explicit,
  };

  if (kind === 'album' && endpoint?.type === 'browse') {
    const typeWord = firstWord && TYPE_WORDS.has(firstWord.toLowerCase()) ? firstWord : null;
    const rest = typeWord ? groups.slice(1) : groups;
    const artists = rest
      .flatMap((g) => g.filter((x) => x.endpoint))
      .map((x) => link(x))
      .filter((x): x is Link => !!x);
    const year = rest.flatMap((g) => g).find((x) => /^\d{4}$/u.test(x.text))?.text ?? null;
    const playlistId = playEndpoint?.type === 'watchPlaylist' ? playEndpoint.playlistId : null;
    return {
      ...common,
      kind: 'album',
      key: keyOf('album', endpoint.browseId),
      browseId: endpoint.browseId,
      artists,
      year,
      albumType: typeWord,
      playlistId,
    };
  }
  if (kind === 'playlist') {
    const browseId =
      endpoint?.type === 'browse'
        ? endpoint.browseId
        : endpoint?.type === 'watchPlaylist'
          ? `VL${endpoint.playlistId}`
          : null;
    if (!browseId) return null;
    const playlistId = browseId.startsWith('VL') ? browseId.slice(2) : browseId;
    const authorRun = subtitleRuns.find((x) => x.endpoint);
    const descr =
      groups.length > 1 ? (groups[groups.length - 1]?.map((x) => x.text).join('') ?? null) : null;
    return {
      ...common,
      kind: 'playlist',
      key: keyOf('playlist', playlistId),
      browseId,
      playlistId,
      author: link(authorRun),
      description: descr,
    };
  }
  if (kind === 'artist' && endpoint?.type === 'browse') {
    return {
      ...common,
      kind: 'artist',
      key: keyOf('artist', endpoint.browseId),
      browseId: endpoint.browseId,
      description: subtitle || null,
      subscribed: null,
    };
  }
  if (kind === 'podcast' && endpoint?.type === 'browse') {
    const authorRun = subtitleRuns.find((x) => x.endpoint);
    return {
      ...common,
      kind: 'podcast',
      key: keyOf('podcast', endpoint.browseId),
      browseId: endpoint.browseId,
      author: link(authorRun),
    };
  }
  if (
    (kind === 'song' || kind === 'video' || kind === 'episode') &&
    endpoint?.type === 'watch' &&
    endpoint.videoId
  ) {
    const artists = subtitleRuns
      .filter((x) => x.endpoint && parseEndpoint(x.endpoint)?.type === 'browse')
      .map((x) => link(x))
      .filter((x): x is Link => !!x);
    const stat =
      groups
        .find((g) => /\b(views|plays)\b/iu.test(g.map((x) => x.text).join('')))
        ?.map((x) => x.text)
        .join('') ?? null;
    const songBase = {
      ...common,
      videoId: endpoint.videoId,
      artists,
      album: null,
      durationSeconds: null,
      stat,
      likeStatus: null,
      setVideoId: null,
      feedbackTokens: null,
    };
    if (kind === 'episode') {
      return {
        ...common,
        kind: 'episode',
        key: keyOf('episode', endpoint.videoId),
        videoId: endpoint.videoId,
        podcast: link(subtitleRuns.find((x) => x.endpoint)),
        date: null,
        durationSeconds: null,
      };
    }
    if (kind === 'video' || (stat && /views/iu.test(stat))) {
      return { ...songBase, kind: 'video', key: keyOf('video', endpoint.videoId), views: stat };
    }
    return { ...songBase, kind: 'song', key: keyOf('song', endpoint.videoId) };
  }
  if (kind === 'category' && endpoint) {
    return { ...common, kind: 'category', key: keyOf('category', title), color: null };
  }
  if (!thumbs.length && !subtitle) {
    return {
      ...common,
      kind: 'action',
      key: keyOf('action', title),
      icon:
        str(nav(r, ['thumbnailRenderer', 'musicThumbnailRenderer', 'icon', 'iconType'])) ??
        str(nav(r, ['icon', 'iconType'])) ??
        null,
    };
  }
  return {
    ...common,
    kind: 'generic',
    key: keyOf('generic', title, subtitle),
    lines: groups.map((g) => g.map((x) => x.text).join('')),
  };
}

/** List rows (search results, playlist tracks, library lists, charts). */
export function parseResponsiveListItem(r: unknown): Item | null {
  const flex = arr(nav(r, ['flexColumns'])).map((c) =>
    nav(c, ['musicResponsiveListItemFlexColumnRenderer', 'text']),
  );
  const titleRuns = runs(flex[0]);
  const title = titleRuns.map((x) => x.text).join('');
  if (!title) return null;
  const videoId =
    str(nav(r, ['playlistItemData', 'videoId'])) ??
    (parseEndpoint(titleRuns[0]?.endpoint) as { videoId?: string } | null)?.videoId;
  const setVideoId = str(nav(r, ['playlistItemData', 'playlistSetVideoId'])) ?? null;
  const navEndpoint = parseEndpoint(nav(r, ['navigationEndpoint']));
  const titleEndpoint = parseEndpoint(titleRuns[0]?.endpoint);
  const playEndpoint = playEndpointOf(r);
  const endpoint = navEndpoint ?? titleEndpoint ?? playEndpoint;
  const thumbs = thumbnails(nav(r, ['thumbnail']));
  const menu = parseMenu(nav(r, ['menu']));
  const explicit = isExplicit(r);
  const fixed = arr(nav(r, ['fixedColumns'])).map((c) =>
    text(nav(c, ['musicResponsiveListItemFixedColumnRenderer', 'text'])),
  );
  const durationSeconds = parseDuration(fixed[0]) ?? null;
  const secondRuns = runs(flex[1]);
  const groups = splitRuns(secondRuns);
  const subtitle = secondRuns.map((x) => x.text).join('');
  const firstWord = groups[0]?.[0]?.text;
  const typeWord =
    firstWord && TYPE_WORDS.has(firstWord.toLowerCase()) && !groups[0]?.[0]?.endpoint
      ? firstWord
      : undefined;
  const rest = typeWord ? groups.slice(1) : groups;
  const likeStatus = str(
    nav(r, ['menu', 'menuRenderer', 'topLevelButtons', 0, 'likeButtonRenderer', 'likeStatus']),
  );
  const feedback = feedbackTokensOf(menu);
  const common = {
    title,
    thumbnails: thumbs,
    endpoint,
    playEndpoint,
    menu,
    subtitle,
    isExplicit: explicit,
  };

  const kind = videoId
    ? typeWord?.toLowerCase() === 'video'
      ? 'video'
      : typeWord?.toLowerCase() === 'episode'
        ? 'episode'
        : 'song'
    : kindFromEndpoint(endpoint, firstWord);

  if ((kind === 'song' || kind === 'video') && videoId) {
    const artists = rest
      .flatMap((g) => g)
      .filter(
        (x) =>
          x.endpoint &&
          parseEndpoint(x.endpoint)?.type === 'browse' &&
          (parseEndpoint(x.endpoint) as { browseId?: string }).browseId?.startsWith('UC'),
      )
      .map((x) => link(x))
      .filter((x): x is Link => !!x);
    const albumRun = [...rest.flatMap((g) => g), ...runs(flex[2]), ...runs(flex[3])].find(
      (x) =>
        x.endpoint &&
        (parseEndpoint(x.endpoint) as { browseId?: string } | null)?.browseId?.startsWith('MPRE'),
    );
    const statText =
      [...rest.map((g) => g.map((x) => x.text).join('')), text(flex[2]) ?? ''].find((t) =>
        /\b(views|plays)\b/iu.test(t),
      ) ?? null;
    const base = {
      ...common,
      videoId,
      artists,
      album: link(albumRun),
      durationSeconds:
        durationSeconds ??
        parseDuration(
          rest
            .flatMap((g) => g)
            .map((x) => x.text)
            .find((t) => /^\d+:\d\d(:\d\d)?$/u.test(t)),
        ),
      stat: statText,
      likeStatus: asLikeStatus(likeStatus),
      setVideoId,
      feedbackTokens: feedback,
    };
    if (kind === 'video') {
      const video: VideoItem = {
        ...base,
        kind: 'video',
        key: keyOf('video', videoId, setVideoId),
        views: statText,
      };
      return video;
    }
    const song: SongItem = { ...base, kind: 'song', key: keyOf('song', videoId, setVideoId) };
    return song;
  }
  if (kind === 'episode' && videoId) {
    return {
      ...common,
      kind: 'episode',
      key: keyOf('episode', videoId),
      videoId,
      podcast: link(rest.flatMap((g) => g).find((x) => x.endpoint)),
      date: rest[0]?.map((x) => x.text).join('') ?? null,
      durationSeconds,
    };
  }
  if (kind === 'album' && endpoint?.type === 'browse') {
    const artists = rest
      .flatMap((g) => g.filter((x) => x.endpoint))
      .map((x) => link(x))
      .filter((x): x is Link => !!x);
    const year = rest.flatMap((g) => g).find((x) => /^\d{4}$/u.test(x.text))?.text ?? null;
    return {
      ...common,
      kind: 'album',
      key: keyOf('album', endpoint.browseId),
      browseId: endpoint.browseId,
      artists,
      year,
      albumType: typeWord ?? null,
      playlistId: playEndpoint?.type === 'watchPlaylist' ? playEndpoint.playlistId : null,
    };
  }
  if (kind === 'playlist' && endpoint?.type === 'browse') {
    const playlistId = endpoint.browseId.startsWith('VL')
      ? endpoint.browseId.slice(2)
      : endpoint.browseId;
    return {
      ...common,
      kind: 'playlist',
      key: keyOf('playlist', playlistId),
      browseId: endpoint.browseId,
      playlistId,
      author: link(rest.flatMap((g) => g).find((x) => x.endpoint)),
      description: rest.length
        ? (rest[rest.length - 1]?.map((x) => x.text).join('') ?? null)
        : null,
    };
  }
  if (kind === 'artist' && endpoint?.type === 'browse') {
    return {
      ...common,
      kind: 'artist',
      key: keyOf('artist', endpoint.browseId),
      browseId: endpoint.browseId,
      description: rest.map((g) => g.map((x) => x.text).join('')).join(' • ') || subtitle || null,
      subscribed: null,
    };
  }
  if (kind === 'podcast' && endpoint?.type === 'browse') {
    return {
      ...common,
      kind: 'podcast',
      key: keyOf('podcast', endpoint.browseId),
      browseId: endpoint.browseId,
      author: link(rest.flatMap((g) => g).find((x) => x.endpoint)),
    };
  }
  if (!thumbs.length && !subtitle && !videoId) {
    return {
      ...common,
      kind: 'action',
      key: keyOf('action', title),
      icon: str(nav(r, ['thumbnail', 'musicThumbnailRenderer', 'icon', 'iconType'])) ?? null,
    };
  }
  return {
    ...common,
    kind: 'generic',
    key: keyOf('generic', title, subtitle),
    lines: [subtitle, text(flex[2]) ?? ''].filter(Boolean),
  };
}

function feedbackTokensOf(menu: MenuItem[]): { add: string | null; remove: string | null } | null {
  let add: string | null = null;
  let remove: string | null = null;
  for (const m of menu) {
    if (m.action?.type === 'feedback') {
      if (/add|save/iu.test(m.text)) add = m.action.feedbackToken;
      else if (/remove/iu.test(m.text)) remove = m.action.feedbackToken;
    }
    if (m.toggled?.action?.type === 'feedback' && m.action?.type === 'feedback') {
      add = m.action.feedbackToken;
      remove = m.toggled.action.feedbackToken;
    }
  }
  return add || remove ? { add, remove } : null;
}

/** Mood/genre chips and "New releases"-style navigation buttons. */
export function parseNavigationButton(r: unknown): Item | null {
  const title = text(nav(r, ['buttonText']));
  const endpoint = parseEndpoint(nav(r, ['clickCommand']));
  if (!title || !endpoint) return null;
  const color = nav(r, ['solid', 'leftStripeColor']);
  return {
    kind: 'category',
    key: keyOf('category', title, endpoint.type === 'browse' ? endpoint.params : undefined),
    title,
    thumbnails: [],
    endpoint,
    playEndpoint: null,
    menu: [],
    subtitle: '',
    isExplicit: false,
    color:
      typeof color === 'number' ? `#${(color & 0xffffff).toString(16).padStart(6, '0')}` : null,
  };
}

/** Queue entries from the `next` endpoint. */
export function parsePlaylistPanelVideo(r: unknown): Item | null {
  const title = text(nav(r, ['title']));
  const videoId = str(nav(r, ['videoId']));
  if (!title || !videoId) return null;
  const byline = runs(nav(r, ['longBylineText']));
  const groups = splitRuns(byline);
  const artists = byline
    .filter(
      (x) =>
        x.endpoint &&
        (parseEndpoint(x.endpoint) as { browseId?: string } | null)?.browseId?.startsWith('UC'),
    )
    .map((x) => link(x))
    .filter((x): x is Link => !!x);
  const albumRun = byline.find(
    (x) =>
      x.endpoint &&
      (parseEndpoint(x.endpoint) as { browseId?: string } | null)?.browseId?.startsWith('MPRE'),
  );
  const thumbs: Thumbnail[] = thumbnails(nav(r, ['thumbnail']));
  const endpoint = parseEndpoint(nav(r, ['navigationEndpoint']));
  const likeStatus = str(
    nav(r, ['menu', 'menuRenderer', 'topLevelButtons', 0, 'likeButtonRenderer', 'likeStatus']),
  );
  return {
    kind: 'song',
    key: keyOf('queue', videoId, str(nav(r, ['playlistSetVideoId']))),
    title,
    thumbnails: thumbs,
    endpoint,
    playEndpoint: endpoint,
    menu: parseMenu(nav(r, ['menu'])),
    subtitle: byline.map((x) => x.text).join(''),
    isExplicit: isExplicit(r),
    videoId,
    artists,
    album: link(albumRun),
    durationSeconds: parseDuration(text(nav(r, ['lengthText']))),
    stat:
      groups
        .find((g) => /views|plays/iu.test(g.map((x) => x.text).join('')))
        ?.map((x) => x.text)
        .join('') ?? null,
    likeStatus: asLikeStatus(likeStatus),
    setVideoId: str(nav(r, ['playlistSetVideoId'])) ?? null,
    feedbackTokens: null,
  };
}

/** Dispatch on renderer type. */
export function parseItem(wrapper: unknown): { item: Item | null; renderer: string | null } {
  const o = obj(wrapper);
  if (!o) return { item: null, renderer: null };
  if (o['musicTwoRowItemRenderer'])
    return {
      item: parseTwoRowItem(o['musicTwoRowItemRenderer']),
      renderer: 'musicTwoRowItemRenderer',
    };
  if (o['musicResponsiveListItemRenderer'])
    return {
      item: parseResponsiveListItem(o['musicResponsiveListItemRenderer']),
      renderer: 'musicResponsiveListItemRenderer',
    };
  if (o['musicNavigationButtonRenderer'])
    return {
      item: parseNavigationButton(o['musicNavigationButtonRenderer']),
      renderer: 'musicNavigationButtonRenderer',
    };
  if (o['playlistPanelVideoRenderer'])
    return {
      item: parsePlaylistPanelVideo(o['playlistPanelVideoRenderer']),
      renderer: 'playlistPanelVideoRenderer',
    };
  if (o['playlistPanelVideoWrapperRenderer']) {
    return {
      item: parsePlaylistPanelVideo(
        nav(o, [
          'playlistPanelVideoWrapperRenderer',
          'primaryRenderer',
          'playlistPanelVideoRenderer',
        ]),
      ),
      renderer: 'playlistPanelVideoWrapperRenderer',
    };
  }
  if (o['musicMultiRowListItemRenderer'])
    return {
      item: parseMultiRowListItem(o['musicMultiRowListItemRenderer']),
      renderer: 'musicMultiRowListItemRenderer',
    };
  const key = Object.keys(o)[0] ?? null;
  return { item: null, renderer: key };
}

/** Podcast episodes in lists. */
function parseMultiRowListItem(r: unknown): Item | null {
  const title = text(nav(r, ['title']));
  const endpoint = parseEndpoint(nav(r, ['onTap'])) ?? endpointFromRuns(nav(r, ['title']));
  if (!title) return null;
  const videoId = endpoint?.type === 'watch' ? endpoint.videoId : undefined;
  const subtitle = text(nav(r, ['subtitle'])) ?? '';
  const common = {
    title,
    thumbnails: thumbnails(nav(r, ['thumbnail'])),
    endpoint,
    playEndpoint:
      parseEndpoint(
        nav(r, ['playbackProgress', 'musicPlaybackProgressRenderer', 'playNavigationEndpoint']),
      ) ?? endpoint,
    menu: parseMenu(nav(r, ['menu'])),
    subtitle,
    isExplicit: false,
  };
  if (videoId) {
    return {
      ...common,
      kind: 'episode',
      key: keyOf('episode', videoId),
      videoId,
      podcast: link(runs(nav(r, ['secondTitle']))[0]),
      date: subtitle || null,
      durationSeconds: null,
    };
  }
  return { ...common, kind: 'generic', key: keyOf('generic', title), lines: [subtitle] };
}
