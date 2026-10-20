/**
 * Versioned selectors for the music.youtube.com DOM.
 *
 * When YouTube changes its markup, bump the version, add a new file, and update
 * the health check. Keep each selector annotated with what it is for and what
 * the bridge falls back to when it is missing.
 */
export const SELECTORS_VERSION = 1 as const;

export const selectors = {
  /** The YouTube player element. Exposes the standard player API (playVideo, seekTo, …). */
  moviePlayer: '#movie_player',
  /** The media element the player is driving. Source of play/pause/timeupdate events. */
  video: '#movie_player video.html5-main-video, ytmusic-player video',
  /** Present only while logged out. */
  signInLink: 'ytmusic-nav-bar a.sign-in-link, a[href*="accounts.google.com/ServiceLogin"]',
  /** Present only while logged in. */
  avatarButton: 'ytmusic-nav-bar #avatar-btn, ytmusic-nav-bar ytmusic-settings-button',
} as const;
