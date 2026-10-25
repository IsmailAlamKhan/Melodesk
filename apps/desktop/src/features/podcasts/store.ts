import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { kvGet, kvSet } from '../../data/kv';
import { allowHosts, hostOf } from '../../net/allow';
import { parseFeed, parseSearch, type Feed, type PodcastHit } from './rss';

const KEY = 'podcasts:feeds';
export const DIRECTORY = 'https://itunes.apple.com/search';

export interface Subscription {
  url: string;
  title: string;
  image: string | null;
}

interface Store {
  loaded: boolean;
  feeds: Subscription[];
}

export const usePodcasts = create<Store>(() => ({ loaded: false, feeds: [] }));

/** The hosts the user's own choices name: the feeds and their pictures, and the directory they search. */
async function allowChosen(feeds: readonly Subscription[]): Promise<void> {
  await allowHosts('podcasts', [
    DIRECTORY,
    ...feeds.flatMap((f) => [f.url, ...(f.image ? [f.image] : [])]),
  ]);
}

export async function loadPodcasts(): Promise<void> {
  try {
    const raw = await kvGet(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    const feeds = Array.isArray(list)
      ? list.flatMap((f: unknown) => {
          const o = (f ?? {}) as Partial<Subscription>;
          return typeof o.url === 'string' && typeof o.title === 'string'
            ? [{ url: o.url, title: o.title, image: typeof o.image === 'string' ? o.image : null }]
            : [];
        })
      : [];
    usePodcasts.setState({ loaded: true, feeds });
    await allowChosen(feeds);
  } catch {
    usePodcasts.setState({ loaded: true });
  }
}

async function saveFeeds(feeds: Subscription[]): Promise<void> {
  usePodcasts.setState({ feeds });
  await kvSet(KEY, JSON.stringify(feeds));
  await allowChosen(feeds);
}

/** Fetch a feed. The address must be on the allowed list first (`allowChosen` or `trying`). */
export async function fetchFeed(url: string): Promise<Feed> {
  const feed = parseFeed(await invoke<string>('net_text', { url }));
  // The audio and pictures of a feed live on hosts it names; they can be fetched for this feed.
  const named = [
    ...(feed.image ? [feed.image] : []),
    ...feed.episodes.flatMap((e) => [e.audioUrl, ...(e.image ? [e.image] : [])]),
  ];
  await allowHosts(
    `podcast:${url}`,
    [...new Set(named.flatMap((n) => hostOf(n) ?? []))].map((h) => `https://${h}`),
  );
  return feed;
}

/** Subscribe to a feed address: it is fetched once to check it is a podcast. */
export async function subscribe(url: string): Promise<Subscription> {
  const address = new URL(url.trim()).toString();
  const existing = usePodcasts.getState().feeds;
  // Allow this host for the check, as the feed list is not saved yet.
  await allowHosts('podcasts', [DIRECTORY, address, ...existing.map((f) => f.url)]);
  const feed = await fetchFeed(address);
  if (feed.episodes.length === 0) throw new Error('No episodes were found in that feed.');
  const sub = { url: address, title: feed.title, image: feed.image };
  await saveFeeds([...existing.filter((f) => f.url !== address), sub]);
  return sub;
}

export async function unsubscribe(url: string): Promise<void> {
  await saveFeeds(usePodcasts.getState().feeds.filter((f) => f.url !== url));
}

export async function searchDirectory(term: string): Promise<PodcastHit[]> {
  const query = new URLSearchParams({ media: 'podcast', entity: 'podcast', limit: '20', term });
  return parseSearch(await invoke<string>('net_text', { url: `${DIRECTORY}?${query.toString()}` }));
}
