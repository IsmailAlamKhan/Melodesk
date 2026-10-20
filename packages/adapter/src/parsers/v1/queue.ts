/**
 * The `next` endpoint: what YouTube Music shows in "Up next", plus the lyrics/related tabs.
 * Note that the *live* queue is owned by the page; this parser is for building/inspecting
 * queues from data (e.g. radio previews). The bridge reports the page's actual queue state.
 */
import { z } from 'zod';
import { parseEndpoint } from '../../innertube/endpoints';
import { arr, nav, str, text } from '../../innertube/nav';
import { parseItem } from '../../innertube/renderers';
import { ItemSchema } from '../../schemas/items';
import { ParseError } from '../../errors';

export const QueueResponseSchema = z.object({
  title: z.string().nullable(),
  /** "Playing from" subtitle */
  playingFrom: z.string().nullable(),
  items: z.array(ItemSchema),
  currentVideoId: z.string().nullable(),
  /** Browse ids for the Lyrics and Related tabs (null when YouTube has none). */
  lyricsBrowseId: z.string().nullable(),
  relatedBrowseId: z.string().nullable(),
  /** Automix (autoplay) playlist id YouTube would continue into. */
  automixPlaylistId: z.string().nullable(),
  continuation: z.string().nullable(),
  unknownRenderers: z.array(z.string()),
});
export type QueueResponse = z.infer<typeof QueueResponseSchema>;

export function parseNext(response: unknown): QueueResponse {
  const tabs = arr(
    nav(response, [
      'contents',
      'singleColumnMusicWatchNextResultsRenderer',
      'tabbedRenderer',
      'watchNextTabbedResultsRenderer',
      'tabs',
    ]),
  );
  if (!tabs.length) throw new ParseError('next', 'no tabs');
  const unknown: string[] = [];
  const panel = nav(tabs[0], [
    'tabRenderer',
    'content',
    'musicQueueRenderer',
    'content',
    'playlistPanelRenderer',
  ]);
  const items = [];
  let automix: string | null = null;
  for (const c of arr(nav(panel, ['contents']))) {
    const auto = str(
      nav(c, [
        'automixPreviewVideoRenderer',
        'content',
        'automixPlaylistVideoRenderer',
        'navigationEndpoint',
        'watchPlaylistEndpoint',
        'playlistId',
      ]),
    );
    if (auto) {
      automix = auto;
      continue;
    }
    const { item, renderer } = parseItem(c);
    if (item) items.push(item);
    else if (renderer) unknown.push(renderer);
  }
  const tabBrowse = (i: number): string | null =>
    str(nav(tabs[i], ['tabRenderer', 'endpoint', 'browseEndpoint', 'browseId'])) ?? null;
  const lyricsTab = tabs.findIndex((t) =>
    /lyrics/iu.test(str(nav(t, ['tabRenderer', 'title'])) ?? ''),
  );
  const relatedTab = tabs.findIndex((t) =>
    /related/iu.test(str(nav(t, ['tabRenderer', 'title'])) ?? ''),
  );
  const header = nav(tabs[0], [
    'tabRenderer',
    'content',
    'musicQueueRenderer',
    'header',
    'musicQueueHeaderRenderer',
  ]);
  return QueueResponseSchema.parse({
    title: text(nav(panel, ['title'])) ?? text(nav(header, ['title'])) ?? null,
    playingFrom: text(nav(header, ['subtitle'])) ?? null,
    items,
    currentVideoId:
      str(nav(response, ['currentVideoEndpoint', 'watchEndpoint', 'videoId'])) ?? null,
    lyricsBrowseId: lyricsTab >= 0 ? tabBrowse(lyricsTab) : null,
    relatedBrowseId: relatedTab >= 0 ? tabBrowse(relatedTab) : null,
    automixPlaylistId: automix,
    continuation:
      str(nav(panel, ['continuations', 0, 'nextRadioContinuationData', 'continuation'])) ??
      str(nav(panel, ['continuations', 0, 'nextContinuationData', 'continuation'])) ??
      null,
    unknownRenderers: unknown,
  });
}

export const LyricsSchema = z.object({
  /** Plain lyrics when YouTube provides them (synced lyrics are a Phase 1 follow-up). */
  text: z.string().nullable(),
  source: z.string().nullable(),
  /** Timed lines when YouTube returns them. */
  synced: z
    .array(z.object({ startMs: z.number(), endMs: z.number(), text: z.string() }))
    .nullable(),
});
export type Lyrics = z.infer<typeof LyricsSchema>;

export function parseLyrics(response: unknown): Lyrics {
  const shelf = nav(response, [
    'contents',
    'sectionListRenderer',
    'contents',
    0,
    'musicDescriptionShelfRenderer',
  ]);
  if (shelf) {
    return LyricsSchema.parse({
      text: text(nav(shelf, ['description'])) ?? null,
      source: text(nav(shelf, ['footer'])) ?? null,
      synced: null,
    });
  }
  // Timed lyrics (elementRenderer / timedLyricsModel)
  const timed = arr(
    nav(response, [
      'contents',
      'elementRenderer',
      'newElement',
      'type',
      'componentType',
      'model',
      'timedLyricsModel',
      'lyricsData',
      'timedLyricsData',
    ]),
  );
  if (timed.length) {
    const synced = timed.map((l) => ({
      startMs: Number(str(nav(l, ['cueRange', 'startTimeMilliseconds'])) ?? 0),
      endMs: Number(str(nav(l, ['cueRange', 'endTimeMilliseconds'])) ?? 0),
      text: str(nav(l, ['lyricLine'])) ?? '',
    }));
    return LyricsSchema.parse({
      text: synced.map((s) => s.text).join('\n'),
      source:
        str(
          nav(response, [
            'contents',
            'elementRenderer',
            'newElement',
            'type',
            'componentType',
            'model',
            'timedLyricsModel',
            'lyricsData',
            'sourceMessage',
          ]),
        ) ?? null,
      synced,
    });
  }
  const msg = text(nav(response, ['contents', 'messageRenderer', 'text']));
  return LyricsSchema.parse({ text: null, source: msg ?? null, synced: null });
}

export { parseEndpoint };
