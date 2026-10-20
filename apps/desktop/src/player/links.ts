/**
 * Turns a YouTube Music (or plain YouTube watch) URL into a same-origin path the player
 * webview may navigate to. Returns null for anything else; never trusts the input host.
 */
const ALLOWED_HOSTS = new Set(['music.youtube.com', 'www.youtube.com', 'youtube.com', 'youtu.be']);

export function toPlayerPath(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) return null;

  if (url.hostname === 'youtu.be') {
    const id = url.pathname.slice(1);
    return /^[\w-]{11}$/u.test(id) ? `/watch?v=${id}` : null;
  }
  if (url.hostname !== 'music.youtube.com') {
    const id = url.searchParams.get('v');
    return id && /^[\w-]{11}$/u.test(id) ? `/watch?v=${id}` : null;
  }
  const path = url.pathname + url.search;
  return path.startsWith('/') && !path.startsWith('//') && !/\s/u.test(path) ? path : null;
}
