import { z } from 'zod';
import { parseEndpoint } from '../../innertube/endpoints';
import { arr, nav, runs, str, text, thumbnails } from '../../innertube/nav';
import { parseItem } from '../../innertube/renderers';
import { findSectionList, parseSectionList } from '../../innertube/shelves';
import { ItemSchema, PageSchema, type Page } from '../../schemas/items';
import { ParseError } from '../../errors';

/** Search result filters, as `params` for the `search` endpoint (from the web client). */
export const SEARCH_FILTERS = {
  all: undefined,
  songs: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D',
  videos: 'EgWKAQIQAWoKEAkQBRAKEAMQBA%3D%3D',
  albums: 'EgWKAQIYAWoKEAkQBRAKEAMQBA%3D%3D',
  artists: 'EgWKAQIgAWoKEAkQBRAKEAMQBA%3D%3D',
  playlists: 'Eg-KAQwIABAAGAAgACgBMABqChAEEAMQCRAFEAo%3D',
  community_playlists: 'EgeKAQQoAEABagoQBBADEAkQBRAK',
  featured_playlists: 'EgeKAQQoADgBagwQDhAKEAMQBRAJEAQ%3D',
  podcasts: 'EgWKAQJQAWoIEBAQERAJEBU%3D',
  episodes: 'EgWKAQJIAWoIEBAQERAJEBU%3D',
  profiles: 'EgWKAQJYAWoIEBAQERAJEBU%3D',
} as const;
export type SearchFilter = keyof typeof SEARCH_FILTERS;

export function parseSearchPage(response: unknown): Page {
  const sectionList = findSectionList(response);
  if (!sectionList) {
    // No results: YouTube returns an empty tab or a "no results" item section.
    return PageSchema.parse({
      header: null,
      chips: [],
      shelves: [],
      continuation: null,
      unknownRenderers: [],
      background: null,
    });
  }
  const parsed = parseSectionList(sectionList);
  // Chips live on the section list header; YouTube's own filter chips carry the params we need.
  return PageSchema.parse({
    header: null,
    chips: parsed.chips,
    shelves: parsed.shelves.filter((s) => s.items.length > 0),
    continuation: parsed.continuation,
    unknownRenderers: parsed.unknownRenderers,
    background: null,
  });
}

export const SuggestionSchema = z.object({
  /** Plain text suggestion to put in the box, or an entity (song/artist/album) to open directly. */
  type: z.enum(['query', 'entity', 'history']),
  text: z.string(),
  /** Which part of the text matched what the user typed (bold prefix), for highlighting. */
  boldPrefix: z.string(),
  item: ItemSchema.nullable(),
  /** For history entries: token to delete the entry from the account's search history. */
  deleteToken: z.string().nullable(),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export function parseSuggestions(response: unknown): Suggestion[] {
  const out: Suggestion[] = [];
  for (const section of arr(nav(response, ['contents']))) {
    for (const c of arr(nav(section, ['searchSuggestionsSectionRenderer', 'contents']))) {
      const s = nav(c, ['searchSuggestionRenderer']) ?? nav(c, ['historySuggestionRenderer']);
      if (s) {
        const r = runs(nav(s, ['suggestion']));
        const full = r.map((x) => x.text).join('');
        const query = str(nav(s, ['navigationEndpoint', 'searchEndpoint', 'query'])) ?? full;
        const deleteToken =
          str(nav(s, ['serviceEndpoint', 'feedbackEndpoint', 'feedbackToken'])) ?? null;
        out.push({
          type: nav(c, ['historySuggestionRenderer']) ? 'history' : 'query',
          text: query,
          boldPrefix: r
            .filter((x) => x.bold)
            .map((x) => x.text)
            .join(''),
          item: null,
          deleteToken,
        });
        continue;
      }
      const { item } = parseItem(c);
      if (item)
        out.push({ type: 'entity', text: item.title, boldPrefix: '', item, deleteToken: null });
    }
  }
  return out;
}

/** Thumbnail helper re-exported for UI convenience. */
export { thumbnails, parseEndpoint, text };
export function assertSearch(response: unknown): void {
  if (!nav(response, ['contents'])) throw new ParseError('search', 'missing contents');
}
