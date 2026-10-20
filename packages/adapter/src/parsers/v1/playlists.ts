import { z } from 'zod';
import { arr, nav, pickThumb, str, text, thumbnails } from '../../innertube/nav';
import { ParseError } from '../../errors';

export const PlaylistOptionSchema = z.object({
  playlistId: z.string(),
  title: z.string(),
  /** "NONE" | "SOME" | "ALL": whether the selected videos are already in this playlist. */
  contains: z.enum(['NONE', 'SOME', 'ALL']),
  privacy: z.string().nullable(),
  /** "12 songs" */
  description: z.string().nullable(),
  artworkUrl: z.string().nullable(),
});
export type PlaylistOption = z.infer<typeof PlaylistOptionSchema>;

/** `playlist/get_add_to_playlist` → the user's playlists, in YouTube's order. */
export function parseAddToPlaylistOptions(response: unknown): PlaylistOption[] {
  const out: PlaylistOption[] = [];
  for (const c of arr(nav(response, ['contents']))) {
    for (const p of arr(nav(c, ['addToPlaylistRenderer', 'playlists']))) {
      const r = nav(p, ['playlistAddToOptionRenderer']);
      const playlistId = str(nav(r, ['playlistId']));
      const title = text(nav(r, ['title']));
      if (!playlistId || !title) continue;
      const contains = str(nav(r, ['containsSelectedVideos']));
      out.push(
        PlaylistOptionSchema.parse({
          playlistId,
          title,
          contains: contains === 'ALL' || contains === 'SOME' ? contains : 'NONE',
          privacy: str(nav(r, ['privacy'])) ?? null,
          description: text(nav(r, ['description'])) ?? null,
          artworkUrl: pickThumb(thumbnails(nav(r, ['thumbnail'])), 64),
        }),
      );
    }
  }
  return out;
}

/** `playlist/create` → the new playlist id. */
export function parseCreatePlaylist(response: unknown): string {
  const id = str(nav(response, ['playlistId']));
  if (!id) throw new ParseError('playlist/create', 'no playlistId in response');
  return id;
}
