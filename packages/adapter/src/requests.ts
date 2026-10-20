/**
 * Request builders: the InnerTube endpoint + body for each thing the UI can ask for. Kept
 * together so the whole surface we touch is visible in one file.
 */
import type { Action } from './innertube/endpoints';

export interface InnertubeRequest {
  endpoint: string;
  body: Record<string, unknown>;
}

export const BROWSE_IDS = {
  home: 'FEmusic_home',
  explore: 'FEmusic_explore',
  newReleases: 'FEmusic_new_releases',
  charts: 'FEmusic_charts',
  moods: 'FEmusic_moods_and_genres',
  library: 'FEmusic_library_landing',
  libraryPlaylists: 'FEmusic_liked_playlists',
  librarySongs: 'FEmusic_liked_videos',
  libraryAlbums: 'FEmusic_liked_albums',
  libraryArtists: 'FEmusic_library_corpus_track_artists',
  librarySubscriptions: 'FEmusic_library_corpus_artists',
  libraryPodcasts: 'FEmusic_library_non_music_audio_list',
  libraryEpisodes: 'FEmusic_library_non_music_audio_episodes_list',
  libraryUploads: 'FEmusic_library_privately_owned_tracks',
  libraryUploadAlbums: 'FEmusic_library_privately_owned_releases',
  libraryUploadArtists: 'FEmusic_library_privately_owned_artists',
  history: 'FEmusic_history',
  likedSongsPlaylist: 'VLLM',
} as const;

export const browse = (browseId: string, params?: string): InnertubeRequest => ({
  endpoint: 'browse',
  body: { browseId, ...(params ? { params } : {}) },
});
export const browseContinuation = (continuation: string): InnertubeRequest => ({
  endpoint: 'browse',
  body: { continuation },
});
export const search = (query: string, params?: string): InnertubeRequest => ({
  endpoint: 'search',
  body: { query, ...(params ? { params } : {}) },
});
export const searchContinuation = (continuation: string): InnertubeRequest => ({
  endpoint: 'search',
  body: { continuation },
});
export const searchSuggestions = (input: string): InnertubeRequest => ({
  endpoint: 'music/get_search_suggestions',
  body: { input },
});
export const next = (opts: {
  videoId?: string;
  playlistId?: string;
  params?: string;
  index?: number;
  continuation?: string;
}): InnertubeRequest => ({
  endpoint: 'next',
  body: {
    enablePersistentPlaylistPanel: true,
    isAudioOnly: true,
    tunerSettingValue: 'AUTOMIX_SETTING_NORMAL',
    ...opts,
  },
});
export const accountMenu = (): InnertubeRequest => ({ endpoint: 'account/account_menu', body: {} });
export const accountsList = (): InnertubeRequest => ({
  endpoint: 'account/accounts_list',
  body: { requestType: 'ACCOUNTS_LIST_REQUEST_TYPE_CHANNEL_SWITCHER' },
});
export const lyrics = (browseId: string): InnertubeRequest => ({
  endpoint: 'browse',
  body: { browseId },
});
export const createPlaylist = (
  title: string,
  description = '',
  privacy: 'PRIVATE' | 'PUBLIC' | 'UNLISTED' = 'PRIVATE',
  videoIds: string[] = [],
): InnertubeRequest => ({
  endpoint: 'playlist/create',
  body: { title, description, privacyStatus: privacy, ...(videoIds.length ? { videoIds } : {}) },
});
export const editPlaylist = (
  playlistId: string,
  actions: Record<string, unknown>[],
): InnertubeRequest => ({ endpoint: 'browse/edit_playlist', body: { playlistId, actions } });
export const playlistActions = {
  addVideos: (videoIds: string[]) =>
    videoIds.map((addedVideoId) => ({ action: 'ACTION_ADD_VIDEO', addedVideoId })),
  removeVideos: (items: { videoId: string; setVideoId: string }[]) =>
    items.map((i) => ({
      action: 'ACTION_REMOVE_VIDEO',
      removedVideoId: i.videoId,
      setVideoId: i.setVideoId,
    })),
  move: (setVideoId: string, movedBeforeSetVideoId: string | null) => [
    {
      action: 'ACTION_MOVE_VIDEO_BEFORE',
      setVideoId,
      ...(movedBeforeSetVideoId ? { movedSetVideoId: movedBeforeSetVideoId } : {}),
    },
  ],
  rename: (title: string) => [{ action: 'ACTION_SET_PLAYLIST_NAME', playlistName: title }],
  describe: (description: string) => [
    { action: 'ACTION_SET_PLAYLIST_DESCRIPTION', playlistDescription: description },
  ],
  privacy: (privacy: 'PRIVATE' | 'PUBLIC' | 'UNLISTED') => [
    { action: 'ACTION_SET_PLAYLIST_PRIVACY', playlistPrivacy: privacy },
  ],
};
export const deletePlaylist = (playlistId: string): InnertubeRequest => ({
  endpoint: 'playlist/delete',
  body: { playlistId },
});

/** Turn a parsed menu/header action into the request that performs it (queue actions are client-side). */
export function requestForAction(action: Action): InnertubeRequest | null {
  switch (action.type) {
    case 'like': {
      const endpoint =
        action.status === 'LIKE'
          ? 'like/like'
          : action.status === 'DISLIKE'
            ? 'like/dislike'
            : 'like/removelike';
      return { endpoint, body: { target: action.target } };
    }
    case 'subscribe':
      return {
        endpoint: 'subscription/subscribe',
        body: {
          channelIds: action.channelIds,
          ...(action.params ? { params: action.params } : {}),
        },
      };
    case 'unsubscribe':
      return { endpoint: 'subscription/unsubscribe', body: { channelIds: action.channelIds } };
    case 'feedback':
      return { endpoint: 'feedback', body: { feedbackTokens: [action.feedbackToken] } };
    case 'playlistEdit':
      return editPlaylist(action.playlistId, action.actions);
    case 'deletePlaylist':
      return deletePlaylist(action.playlistId);
    case 'queueAdd':
    case 'share':
    case 'addToPlaylist':
    case 'signInRequired':
      return null;
  }
}

/** The account's playlists a video can be added to (the web app's "Save to playlist" sheet). */
export const addToPlaylistOptions = (videoIds: string[]): InnertubeRequest => ({
  endpoint: 'playlist/get_add_to_playlist',
  body: { videoIds, excludeWatchLater: true },
});
