/**
 * Minimal typing for the subset of the YouTube player element API the bridge relies on.
 * All calls are wrapped: the element may be missing or the method may vanish after a
 * YouTube deploy, which the health check surfaces instead of throwing.
 */
export interface YtPlayerElement extends HTMLElement {
  playVideo?: () => void;
  pauseVideo?: () => void;
  nextVideo?: () => void;
  previousVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  getVolume?: () => number;
  setVolume?: (volume0to100: number) => void;
  isMuted?: () => boolean;
  mute?: () => void;
  unMute?: () => void;
  getPlayerState?: () => number;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getVideoData?: () => { video_id?: string; title?: string; author?: string } | undefined;
}

export const REQUIRED_PLAYER_METHODS = [
  'playVideo',
  'pauseVideo',
  'nextVideo',
  'previousVideo',
  'seekTo',
  'getVolume',
  'setVolume',
] as const satisfies readonly (keyof YtPlayerElement)[];
