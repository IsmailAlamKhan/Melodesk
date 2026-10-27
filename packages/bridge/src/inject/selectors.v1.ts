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
  /** The "Video paused. Continue watching?" question (see idle-prompt.ts). */
  idlePrompt: 'ytmusic-you-there-renderer, yt-confirm-dialog-renderer, tp-yt-paper-dialog',
  /**
   * The page's own "Skip" button on an ad that can be skipped. Only present once the ad allows it. It
   * can sit outside the player element (the "detached" container), so this is looked for in the whole
   * page. We never click it by ourselves: only when the listener presses Skip ad in our player bar.
   */
  skipAd:
    '.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button, .ytp-ad-skip-button-container button, .ytp-ad-skip-button-slot button',
  /**
   * The page's own Song / Video switch (it has `.song-button` and `.video-button`, and the attributes
   * `is-video-playback-mode-selected` and `selected-item-has-video`). It is in the page even while the
   * player page is closed. Missing for some accounts: then the picture is simply shown as it is.
   */
  avToggle: 'ytmusic-av-toggle',
  /** Present only while logged out. */
  signInLink: 'ytmusic-nav-bar a.sign-in-link, a[href*="accounts.google.com/ServiceLogin"]',
  /** Present only while logged in. */
  avatarButton: 'ytmusic-nav-bar #avatar-btn, ytmusic-nav-bar ytmusic-settings-button',
} as const;
