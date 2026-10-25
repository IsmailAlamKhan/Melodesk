import { useQuery } from '@tanstack/react-query';
import {
  albumTracks,
  artistTracks,
  countTracks,
  listAlbums,
  listArtists,
  listSongs,
} from './library';
import { loadFolders } from './scan';

// The index only changes when a scan writes to it (which invalidates ['local']), so it is never stale.
const base = { staleTime: Infinity, gcTime: 1000 * 60 * 10 } as const;

export const useFolders = () =>
  useQuery({ queryKey: ['local', 'folders'], queryFn: () => loadFolders(), ...base });
export const useTrackCount = () =>
  useQuery({ queryKey: ['local', 'count'], queryFn: () => countTracks(), ...base });
export const useSongs = (query: string) =>
  useQuery({ queryKey: ['local', 'songs', query], queryFn: () => listSongs(query), ...base });
export const useAlbums = (query: string) =>
  useQuery({ queryKey: ['local', 'albums', query], queryFn: () => listAlbums(query), ...base });
export const useArtists = (query: string) =>
  useQuery({ queryKey: ['local', 'artists', query], queryFn: () => listArtists(query), ...base });
export const useAlbumTracks = (album: string, artist: string) =>
  useQuery({
    queryKey: ['local', 'album', album, artist],
    queryFn: () => albumTracks(album, artist),
    ...base,
  });
export const useArtistTracks = (artist: string) =>
  useQuery({
    queryKey: ['local', 'artist', artist],
    queryFn: () => artistTracks(artist),
    ...base,
  });
