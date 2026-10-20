/** Playlist mutations: every one writes to the account, then invalidates the queries that show playlists. */
import {
  parseAddToPlaylistOptions,
  parseCreatePlaylist,
  playlistActions,
  requests,
  type PlaylistOption,
} from '@melodesk/adapter';
import { run } from '../../data/innertube';
import { queryClient } from '../../data/queryClient';
import { toast } from '../toast';

export type Privacy = 'PUBLIC' | 'PRIVATE' | 'UNLISTED';

function refresh(playlistId?: string): void {
  void queryClient.invalidateQueries({ queryKey: ['browse', 'FEmusic_liked_playlists'] });
  void queryClient.invalidateQueries({ queryKey: ['browse', 'FEmusic_library_landing'] });
  void queryClient.invalidateQueries({ queryKey: ['addToPlaylist'] });
  if (playlistId) void queryClient.invalidateQueries({ queryKey: ['browse', `VL${playlistId}`] });
}

export async function createPlaylist(
  title: string,
  description: string,
  privacy: Privacy,
  videoIds: string[] = [],
): Promise<string> {
  const id = parseCreatePlaylist(
    await run(requests.createPlaylist(title, description, privacy, videoIds)),
  );
  refresh(id);
  toast(`Created “${title}”`);
  return id;
}

export async function editPlaylistDetails(
  playlistId: string,
  changes: { title?: string; description?: string; privacy?: Privacy },
): Promise<void> {
  const actions = [
    ...(changes.title !== undefined ? playlistActions.rename(changes.title) : []),
    ...(changes.description !== undefined ? playlistActions.describe(changes.description) : []),
    ...(changes.privacy !== undefined ? playlistActions.privacy(changes.privacy) : []),
  ];
  if (!actions.length) return;
  await run(requests.editPlaylist(playlistId, actions));
  refresh(playlistId);
  toast('Playlist updated');
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  await run(requests.deletePlaylist(playlistId));
  refresh(playlistId);
  toast('Playlist deleted');
}

export async function addToPlaylist(
  playlistId: string,
  videoIds: string[],
  title?: string,
): Promise<void> {
  await run(requests.editPlaylist(playlistId, playlistActions.addVideos(videoIds)));
  refresh(playlistId);
  toast(title ? `Saved to ${title}` : 'Saved to playlist');
}

export async function removeFromPlaylist(
  playlistId: string,
  items: { videoId: string; setVideoId: string }[],
): Promise<void> {
  await run(requests.editPlaylist(playlistId, playlistActions.removeVideos(items)));
  refresh(playlistId);
  toast('Removed from playlist');
}

/** Move `setVideoId` before `beforeSetVideoId` (null = to the end). */
export async function movePlaylistItem(
  playlistId: string,
  setVideoId: string,
  beforeSetVideoId: string | null,
): Promise<void> {
  await run(requests.editPlaylist(playlistId, playlistActions.move(setVideoId, beforeSetVideoId)));
  refresh(playlistId);
}

export async function fetchAddToPlaylistOptions(videoIds: string[]): Promise<PlaylistOption[]> {
  return parseAddToPlaylistOptions(await run(requests.addToPlaylistOptions(videoIds)));
}
