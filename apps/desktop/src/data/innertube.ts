/**
 * Typed data access for the UI. Every function performs the request through the player webview
 * (the page's own network layer, with the page's own account) and parses with the adapter.
 */
import {
  parseAccountMenu,
  parseBrowsePage,
  parseContinuation,
  parseLyrics,
  parseNext,
  parseSearchPage,
  parseSuggestions,
  requests,
  type Account,
  type InnertubeRequest,
  type Lyrics,
  type Page,
  type QueueResponse,
  type Shelf,
  type Suggestion,
} from '@melodesk/adapter';
import { innertube } from '../player/data';

export async function run(req: InnertubeRequest): Promise<unknown> {
  return innertube(req.endpoint, req.body);
}

export async function fetchBrowse(browseId: string, params?: string): Promise<Page> {
  return parseBrowsePage(await run(requests.browse(browseId, params)));
}

export async function fetchContinuation(
  continuation: string,
): Promise<{ shelves: Shelf[]; continuation: string | null; unknownRenderers: string[] }> {
  return parseContinuation(await run(requests.browseContinuation(continuation)));
}

export async function fetchSearch(query: string, params?: string): Promise<Page> {
  return parseSearchPage(await run(requests.search(query, params)));
}

export async function fetchSearchContinuation(
  continuation: string,
): Promise<{ shelves: Shelf[]; continuation: string | null; unknownRenderers: string[] }> {
  return parseContinuation(await run(requests.searchContinuation(continuation)));
}

export async function fetchSuggestions(input: string): Promise<Suggestion[]> {
  return parseSuggestions(await run(requests.searchSuggestions(input)));
}

export async function fetchNext(opts: {
  videoId?: string;
  playlistId?: string;
  params?: string;
}): Promise<QueueResponse> {
  return parseNext(await run(requests.next(opts)));
}

export async function fetchLyrics(browseId: string): Promise<Lyrics> {
  return parseLyrics(await run(requests.lyrics(browseId)));
}

export async function fetchAccount(): Promise<Account> {
  return parseAccountMenu(await run(requests.accountMenu()));
}
