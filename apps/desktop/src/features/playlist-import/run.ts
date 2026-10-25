import type { Page } from '@melodesk/adapter';
import { createPlaylist, addToPlaylist, type Privacy } from '../../app/dialogs/playlists';
import { fetchSearch } from '../../data/innertube';
import { bestMatch, type Candidate } from './match';
import type { ImportEntry } from './parse';

export interface Matched {
  entry: ImportEntry;
  /** The song to add, or null when nothing matched well enough. */
  videoId: string | null;
  /** What was found, for the review list. */
  found: { title: string; artist: string } | null;
}

const PARALLEL = 3;
const FIRST_BATCH = 100;
const ADD_BATCH = 50;

/** The songs a search page offers, whichever shelf they are in. */
export function candidatesFrom(page: Page): Candidate[] {
  const out: Candidate[] = [];
  for (const shelf of page.shelves)
    for (const item of shelf.items)
      if (item.kind === 'song' || item.kind === 'video')
        out.push({
          videoId: item.videoId,
          title: item.title,
          artists: item.artists.map((a) => a.name),
          durationSeconds: item.durationSeconds,
        });
  return out;
}

/** Look every entry up in YouTube Music, a few at a time. Entries that name their video are taken as they are. */
export async function matchEntries(
  entries: readonly ImportEntry[],
  onProgress: (done: number) => void,
  cancelled: () => boolean = () => false,
): Promise<Matched[]> {
  const results: (Matched | undefined)[] = new Array<Matched | undefined>(entries.length);
  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next;
      next += 1;
      const entry = entries[i];
      if (!entry || cancelled()) return;
      results[i] = await matchOne(entry);
      done += 1;
      onProgress(done);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return results.filter((r): r is Matched => r !== undefined);
}

async function matchOne(entry: ImportEntry): Promise<Matched> {
  if (entry.videoId)
    return {
      entry,
      videoId: entry.videoId,
      found: { title: entry.title, artist: entry.artist },
    };
  try {
    const page = await fetchSearch(`${entry.title} ${entry.artist}`.trim());
    const best = bestMatch(entry, candidatesFrom(page));
    if (best)
      return {
        entry,
        videoId: best.candidate.videoId,
        found: { title: best.candidate.title, artist: best.candidate.artists.join(', ') },
      };
  } catch {
    /* a search that failed leaves the song unmatched; the user sees it in the review */
  }
  return { entry, videoId: null, found: null };
}

/** Make the playlist in the account, with the matched songs (each once, in file order). */
export async function createFromMatches(
  title: string,
  privacy: Privacy,
  matches: readonly Matched[],
): Promise<string> {
  const ids = [...new Set(matches.flatMap((m) => (m.videoId ? [m.videoId] : [])))];
  const id = await createPlaylist(title, '', privacy, ids.slice(0, FIRST_BATCH));
  for (let i = FIRST_BATCH; i < ids.length; i += ADD_BATCH)
    await addToPlaylist(id, ids.slice(i, i + ADD_BATCH), title);
  return id;
}
