/**
 * URLs handed to the app: `melodesk://…` deep links and music.youtube.com links from the OS,
 * a browser, or a second launch. Resolved into our own routes or playback; never navigated raw.
 */
import { router } from './router';
import { playEndpoint, routeForEndpoint } from '../player/actions';

const VIDEO_ID = /^[\w-]{11}$/u;

export function handleIncomingUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return;
  }
  // melodesk://open?url=https://music.youtube.com/... → unwrap
  if (url.protocol === 'melodesk:' && (url.hostname === 'open' || url.pathname === '//open')) {
    const inner = url.searchParams.get('url');
    if (inner) handleIncomingUrl(inner);
    return;
  }
  const host =
    url.protocol === 'melodesk:'
      ? url.hostname || url.pathname.replace(/^\/+/u, '').split(/[/?]/u)[0]
      : url.hostname;
  const path = url.protocol === 'melodesk:' ? '' : url.pathname;
  const v = url.searchParams.get('v');
  const list = url.searchParams.get('list');
  const q = url.searchParams.get('q');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1);
    if (VIDEO_ID.test(id)) void playEndpoint({ type: 'watch', videoId: id });
    return;
  }
  if (host === 'watch' || path === '/watch') {
    if (v && VIDEO_ID.test(v))
      void playEndpoint({ type: 'watch', videoId: v, ...(list ? { playlistId: list } : {}) });
    else if (list) void playEndpoint({ type: 'watchPlaylist', playlistId: list });
    return;
  }
  if (host === 'playlist' || path === '/playlist') {
    if (list) void router.navigate(`/playlist/${encodeURIComponent(list)}`);
    return;
  }
  if (host === 'search' || path === '/search') {
    if (q) void router.navigate(`/search?q=${encodeURIComponent(q)}`);
    return;
  }
  if (host === 'browse' || path.startsWith('/browse/')) {
    const id =
      url.protocol === 'melodesk:'
        ? (url.pathname.replace(/^\/+/u, '').split('/')[1] ?? url.searchParams.get('id'))
        : path.slice('/browse/'.length);
    if (id) {
      const route = routeForEndpoint({ type: 'browse', browseId: id });
      if (route) void router.navigate(route);
    }
    return;
  }
  if (host === 'channel' || path.startsWith('/channel/')) {
    const id = path.split('/')[2] ?? url.pathname.replace(/^\/+/u, '').split('/')[1];
    if (id) void router.navigate(`/artist/${encodeURIComponent(id)}`);
    return;
  }
  if (url.protocol === 'melodesk:' && host === 'settings') void router.navigate('/settings');
}
