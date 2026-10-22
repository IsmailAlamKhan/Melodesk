/**
 * Hosts whose images are served with CORS headers (Access-Control-Allow-Origin: *). Only for those
 * can an <img> be asked in CORS mode, which lets the offline cache and the colour sampler reuse its
 * download; for any other host (gstatic, music.youtube.com…) CORS mode would make the image fail.
 */
const CORS_SUFFIXES = ['googleusercontent.com', 'ggpht.com', 'ytimg.com'];

export function supportsCors(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return CORS_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
}
