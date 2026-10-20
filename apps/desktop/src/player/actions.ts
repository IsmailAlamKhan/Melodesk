/**
 * Everything the UI can *do* with an item or page: play, open, run a menu action.
 * Playback and queue mutations go through the bridge (the page's own logic); account
 * mutations go through InnerTube and then invalidate the affected queries so the UI
 * re-reads the account state (two-way sync, account as source of truth).
 */
import {
  requestForAction,
  type Action,
  type Endpoint,
  type Item,
  type MenuItem,
} from '@melodesk/adapter';
import { queryClient } from '../data/queryClient';
import { run } from '../data/innertube';
import { sendCommand } from './ipc';
import { toast } from '../app/toast';
import { openDialog } from '../app/dialogs/store';

/** Raw InnerTube endpoint object the page understands, rebuilt from our typed endpoint. */
export function rawEndpoint(ep: Endpoint): Record<string, unknown> | null {
  switch (ep.type) {
    case 'watch':
      return {
        watchEndpoint: {
          ...(ep.videoId ? { videoId: ep.videoId } : {}),
          ...(ep.playlistId ? { playlistId: ep.playlistId } : {}),
          ...(ep.params ? { params: ep.params } : {}),
          ...(ep.index !== undefined ? { index: ep.index } : {}),
          ...(ep.playlistSetVideoId ? { playlistSetVideoId: ep.playlistSetVideoId } : {}),
        },
      };
    case 'watchPlaylist':
      return {
        watchPlaylistEndpoint: {
          playlistId: ep.playlistId,
          ...(ep.params ? { params: ep.params } : {}),
        },
      };
    case 'browse':
      return {
        browseEndpoint: { browseId: ep.browseId, ...(ep.params ? { params: ep.params } : {}) },
      };
    case 'search':
      return { searchEndpoint: { query: ep.query, ...(ep.params ? { params: ep.params } : {}) } };
    default:
      return null;
  }
}

export async function playEndpoint(ep: Endpoint | null): Promise<void> {
  if (!ep || (ep.type !== 'watch' && ep.type !== 'watchPlaylist')) return;
  const raw = rawEndpoint(ep);
  if (raw) await sendCommand({ type: 'endpoint', endpoint: raw, mode: 'navigate' });
}

export async function playItem(item: Item): Promise<void> {
  if (item.kind === 'action') {
    if (/new playlist/iu.test(item.title)) openDialog({ type: 'createPlaylist' });
    else if (item.endpoint) await playEndpoint(item.endpoint);
    return;
  }
  const ep =
    item.playEndpoint ??
    (item.endpoint?.type === 'watch' || item.endpoint?.type === 'watchPlaylist'
      ? item.endpoint
      : null);
  if (ep) await playEndpoint(ep);
}

export async function queueAdd(
  target: {
    videoId?: string | undefined;
    playlistId?: string | undefined;
    params?: string | undefined;
  },
  position: 'next' | 'end',
  label?: string,
): Promise<void> {
  await sendCommand({ type: 'queueAdd', target, position });
  toast(label ?? (position === 'next' ? 'Will play next' : 'Added to queue'));
}

/** Route in our UI for a navigation endpoint, or null when it is not a page (playback, url…). */
export function routeForEndpoint(ep: Endpoint | null): string | null {
  if (!ep) return null;
  if (ep.type === 'search')
    return `/search?q=${encodeURIComponent(ep.query)}${ep.params ? `&params=${encodeURIComponent(ep.params)}` : ''}`;
  if (ep.type !== 'browse') return null;
  const id = ep.browseId;
  const q = ep.params ? `?params=${encodeURIComponent(ep.params)}` : '';
  if (id === 'FEmusic_home') return '/';
  if (id === 'FEmusic_explore') return '/explore';
  if (id === 'FEmusic_charts') return '/charts';
  if (id === 'FEmusic_moods_and_genres') return '/moods';
  if (id === 'FEmusic_new_releases') return '/new-releases';
  if (id === 'FEmusic_history') return '/library/history';
  if (id === 'FEmusic_liked_videos' || id === 'VLLM') return '/playlist/LM';
  if (id === 'FEmusic_liked_playlists') return '/library/playlists';
  if (id === 'FEmusic_liked_albums') return '/library/albums';
  if (id === 'FEmusic_library_corpus_track_artists') return '/library/artists';
  if (id === 'FEmusic_library_corpus_artists') return '/library/subscriptions';
  if (id.startsWith('UC') || id.startsWith('MPLA')) return `/artist/${id}${q}`;
  if (id.startsWith('MPRE')) return `/album/${id}${q}`;
  if (id.startsWith('VL')) return `/playlist/${id.slice(2)}${q}`;
  return `/browse/${encodeURIComponent(id)}${q}`;
}

/** Query keys to refresh after an account mutation. Broad on purpose: the account is the truth. */
function invalidateAfter(action: Action): void {
  const keys: string[][] = [['browse'], ['library'], ['account']];
  if (action.type === 'like' || action.type === 'feedback') keys.push(['search']);
  for (const k of keys) void queryClient.invalidateQueries({ queryKey: k });
}

export async function runAction(
  action: Action,
  ctx: { item?: Item; label?: string } = {},
): Promise<void> {
  switch (action.type) {
    case 'queueAdd':
      await queueAdd(
        action.target,
        action.position === 'INSERT_AFTER_CURRENT_VIDEO' ? 'next' : 'end',
        action.toast,
      );
      return;
    case 'share': {
      const url = shareUrl(ctx.item);
      if (url) {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      }
      return;
    }
    case 'addToPlaylist':
      // handled by the AddToPlaylist dialog (needs UI)
      return;
    case 'signInRequired':
      toast('Sign in to YouTube Music to do that');
      return;
    default: {
      const req = requestForAction(action);
      if (!req) return;
      await run(req);
      invalidateAfter(action);
      if (ctx.label) toast(ctx.label);
    }
  }
}

export function shareUrl(item: Item | undefined): string | null {
  if (!item) return null;
  switch (item.kind) {
    case 'song':
    case 'video':
    case 'episode':
      return `https://music.youtube.com/watch?v=${item.videoId}`;
    case 'album':
      return `https://music.youtube.com/browse/${item.browseId}`;
    case 'playlist':
      return `https://music.youtube.com/playlist?list=${item.playlistId}`;
    case 'artist':
      return `https://music.youtube.com/channel/${item.browseId}`;
    case 'podcast':
      return `https://music.youtube.com/browse/${item.browseId}`;
    default:
      return null;
  }
}

/** Execute a parsed menu item: navigate (returns a route) or run its action. */
export async function runMenuItem(
  m: MenuItem,
  item: Item | undefined,
  navigate: (to: string) => void,
): Promise<void> {
  if (m.navigate) {
    if (m.navigate.type === 'watch' || m.navigate.type === 'watchPlaylist') {
      await playEndpoint(m.navigate);
      return;
    }
    const route = routeForEndpoint(m.navigate);
    if (route) navigate(route);
    return;
  }
  const active = m.toggled?.isToggled ? m.toggled.action : m.action;
  if (active)
    await runAction(active, {
      ...(item ? { item } : {}),
      label: m.toggled?.isToggled ? m.toggled.text : m.text,
    });
}
