import { z } from 'zod';
import {
  ActionSchema,
  EndpointSchema,
  MenuItemSchema,
  WatchEndpointSchema,
} from '../innertube/endpoints';

/** A link to an artist/album/user etc. inside an item's subtitle. */
export const LinkSchema = z.object({ name: z.string(), endpoint: EndpointSchema.nullable() });
export type Link = z.infer<typeof LinkSchema>;

export const ThumbnailSchema = z.object({ url: z.string(), width: z.number(), height: z.number() });
export type Thumbnail = z.infer<typeof ThumbnailSchema>;

export const LikeStatusSchema = z.enum(['LIKE', 'DISLIKE', 'INDIFFERENT']);
export type LikeStatus = z.infer<typeof LikeStatusSchema>;

const base = {
  /** Stable key for React lists; derived from ids, falls back to title. */
  key: z.string(),
  title: z.string(),
  thumbnails: z.array(ThumbnailSchema),
  /** What tapping the item does: open a page or start playback. */
  endpoint: EndpointSchema.nullable(),
  /** What the item's play button does (may differ from tapping, e.g. albums). */
  playEndpoint: EndpointSchema.nullable(),
  menu: z.array(MenuItemSchema),
  /** Raw subtitle for display when we could not classify its parts. */
  subtitle: z.string(),
  isExplicit: z.boolean(),
};

export const SongItemSchema = z.object({
  ...base,
  kind: z.literal('song'),
  videoId: z.string(),
  artists: z.array(LinkSchema),
  album: LinkSchema.nullable(),
  durationSeconds: z.number().nullable(),
  /** e.g. "1.2B plays" when YouTube shows it */
  stat: z.string().nullable(),
  likeStatus: LikeStatusSchema.nullable(),
  /** Playlist-item identity for remove/reorder in the user's own playlists. */
  setVideoId: z.string().nullable(),
  feedbackTokens: z
    .object({ add: z.string().nullable(), remove: z.string().nullable() })
    .nullable(),
});
export const VideoItemSchema = SongItemSchema.extend({
  kind: z.literal('video'),
  views: z.string().nullable(),
});
export const AlbumItemSchema = z.object({
  ...base,
  kind: z.literal('album'),
  browseId: z.string(),
  artists: z.array(LinkSchema),
  year: z.string().nullable(),
  /** "Album", "Single", "EP"… as YouTube labels it */
  albumType: z.string().nullable(),
  playlistId: z.string().nullable(),
});
export const PlaylistItemSchema = z.object({
  ...base,
  kind: z.literal('playlist'),
  browseId: z.string(),
  playlistId: z.string(),
  author: LinkSchema.nullable(),
  /** "51 songs", "1.2M views" … */
  description: z.string().nullable(),
});
export const ArtistItemSchema = z.object({
  ...base,
  kind: z.literal('artist'),
  browseId: z.string(),
  /** "7.2M subscribers" / "Artist" */
  description: z.string().nullable(),
  subscribed: z.boolean().nullable(),
});
export const PodcastItemSchema = z.object({
  ...base,
  kind: z.literal('podcast'),
  browseId: z.string(),
  author: LinkSchema.nullable(),
});
export const EpisodeItemSchema = z.object({
  ...base,
  kind: z.literal('episode'),
  videoId: z.string(),
  podcast: LinkSchema.nullable(),
  date: z.string().nullable(),
  durationSeconds: z.number().nullable(),
});
/** Mood/genre buttons, "New releases" links etc. */
export const CategoryItemSchema = z.object({
  ...base,
  kind: z.literal('category'),
  color: z.string().nullable(),
});
/** Buttons that appear inside lists/grids: "New playlist", "Shuffle all", "Add podcast". */
export const ActionItemSchema = z.object({
  ...base,
  kind: z.literal('action'),
  icon: z.string().nullable(),
});
/** Something we recognised as an item but could not classify (still renders generically). */
export const GenericItemSchema = z.object({
  ...base,
  kind: z.literal('generic'),
  lines: z.array(z.string()),
});

export const ItemSchema = z.discriminatedUnion('kind', [
  SongItemSchema,
  VideoItemSchema,
  AlbumItemSchema,
  PlaylistItemSchema,
  ArtistItemSchema,
  PodcastItemSchema,
  EpisodeItemSchema,
  CategoryItemSchema,
  ActionItemSchema,
  GenericItemSchema,
]);
export type Item = z.infer<typeof ItemSchema>;
export type SongItem = z.infer<typeof SongItemSchema>;
export type VideoItem = z.infer<typeof VideoItemSchema>;
export type AlbumItem = z.infer<typeof AlbumItemSchema>;
export type PlaylistItem = z.infer<typeof PlaylistItemSchema>;
export type ArtistItem = z.infer<typeof ArtistItemSchema>;

export const ShelfSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  /** "Show all"/"More" target */
  moreEndpoint: EndpointSchema.nullable(),
  layout: z.enum(['carousel', 'list', 'grid', 'ranked']),
  items: z.array(ItemSchema),
  /** Token for loading more items of this shelf itself (long lists). */
  continuation: z.string().nullable(),
});
export type Shelf = z.infer<typeof ShelfSchema>;

export const ChipSchema = z.object({
  text: z.string(),
  endpoint: EndpointSchema.nullable(),
  isSelected: z.boolean(),
});
export type Chip = z.infer<typeof ChipSchema>;

export const PageHeaderSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  secondSubtitle: z.string().nullable(),
  description: z.string().nullable(),
  thumbnails: z.array(ThumbnailSchema),
  /** Primary play (shuffle for artists, play for albums/playlists). */
  playEndpoint: EndpointSchema.nullable(),
  shuffleEndpoint: EndpointSchema.nullable(),
  radioEndpoint: EndpointSchema.nullable(),
  /** Subscribe/like/save buttons etc., in YouTube's order. */
  actions: z.array(
    z.object({
      icon: z.string().nullable(),
      text: z.string(),
      action: ActionSchema.nullable(),
      toggledAction: ActionSchema.nullable(),
      isToggled: z.boolean(),
    }),
  ),
  menu: z.array(MenuItemSchema),
  /** Artist pages: channel id for subscribe; playlists: id for edit. */
  channelId: z.string().nullable(),
  playlistId: z.string().nullable(),
  /** The owner can edit this playlist. */
  isEditable: z.boolean(),
  /** Editable playlists only: current privacy as YouTube reports it. */
  privacy: z.enum(['PUBLIC', 'PRIVATE', 'UNLISTED']).nullable(),
  subscribed: z.boolean().nullable(),
  likeStatus: LikeStatusSchema.nullable(),
});
export type PageHeader = z.infer<typeof PageHeaderSchema>;

export const PageSchema = z.object({
  header: PageHeaderSchema.nullable(),
  chips: z.array(ChipSchema),
  shelves: z.array(ShelfSchema),
  /** Token for the next page of shelves (home feed infinite scroll). */
  continuation: z.string().nullable(),
  /** Renderer names we did not recognise; drives the health check. */
  unknownRenderers: z.array(z.string()),
  /** Backdrop artwork for the page, when YouTube provides one. */
  background: z.string().nullable(),
});
export type Page = z.infer<typeof PageSchema>;

export { WatchEndpointSchema };
