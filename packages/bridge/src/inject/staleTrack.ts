import type { Track } from '../protocol';

/** How long a new song may carry the previous song's details before they are believed anyway. */
export const STALE_TRACK_GRACE_MS = 2500;

/**
 * The player knows the new video's id the moment a song changes, but the page's media metadata (title,
 * artist, cover) is replaced a moment later. In between, the id is new and the details are the last
 * song's. That pair must not be reported as a track: lyrics would be looked up for the wrong title.
 *
 * `since` is when this id was first seen with those details. Two different songs can share a title
 * (a repeat, a re-upload), so after the grace period they are believed.
 */
export function isStaleTrack(
  reported: Track | null,
  next: Track | null,
  since: number,
  now: number,
): boolean {
  if (!reported || !next?.videoId || next.videoId === reported.videoId) return false;
  const sameDetails = next.title === reported.title && next.artist === reported.artist;
  return sameDetails && now - since < STALE_TRACK_GRACE_MS;
}
