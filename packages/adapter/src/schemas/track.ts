import { z } from 'zod';

/** A song or video as the UI understands it, independent of YouTube's response shapes. */
export const TrackRefSchema = z.object({
  videoId: z.string().min(1).max(64),
  title: z.string().min(1).max(512),
  artists: z.array(
    z.object({ name: z.string().max(256), browseId: z.string().max(64).nullable() }),
  ),
  album: z
    .object({ name: z.string().max(256), browseId: z.string().max(64).nullable() })
    .nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  artworkUrl: z.string().max(2048).nullable(),
  isExplicit: z.boolean(),
});
export type TrackRef = z.infer<typeof TrackRefSchema>;
