/** Playlist power tools: sorting, duplicates, merge and export, on top of the account's own data. */
import type { Track } from '../../app/components/trackSort';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { addToPlaylist, movePlaylistItem } from '../../app/dialogs/playlists';
import { t } from '../../i18n/index';
import { toast } from '../../app/toast';

/** Groups of tracks that are the same video or the same title+artist. */
export function findDuplicates(tracks: Track[]): Track[][] {
  const groups = new Map<string, Track[]>();
  for (const t of tracks) {
    const byId = `id:${t.videoId}`;
    const byName = `name:${t.title.trim().toLowerCase()}|${(t.artists[0]?.name ?? '').trim().toLowerCase()}`;
    const key = groups.has(byId) ? byId : groups.has(byName) ? byName : byId;
    const g = groups.get(key) ?? [];
    g.push(t);
    groups.set(key, g);
    if (key === byId) groups.set(byName, g);
  }
  const unique = new Set<Track[]>();
  for (const g of groups.values()) if (g.length > 1) unique.add(g);
  return [...unique];
}

/**
 * Apply an order to the account's playlist with ACTION_MOVE_VIDEO_BEFORE, one move per track
 * that is out of place. Capped so a mistake cannot fire hundreds of requests.
 */
export async function applyOrder(
  playlistId: string,
  current: Track[],
  desired: Track[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const MAX = 200;
  if (desired.length > MAX) throw new Error(t('tools.reorderLimit', { max: MAX }));
  const order = [...current];
  let moves = 0;
  for (let i = 0; i < desired.length; i += 1) {
    const want = desired[i];
    if (!want?.setVideoId) continue;
    if (order[i]?.setVideoId === want.setVideoId) continue;
    const from = order.findIndex((t) => t.setVideoId === want.setVideoId);
    if (from < 0) continue;
    const before = order[i]?.setVideoId ?? null;
    await movePlaylistItem(playlistId, want.setVideoId, before);
    order.splice(from, 1);
    order.splice(i, 0, want);
    moves += 1;
    onProgress?.(i + 1, desired.length);
  }
  toast(moves ? t('toast.reordered', { count: moves }) : t('toast.alreadyOrdered'));
}

export async function mergeInto(
  targetPlaylistId: string,
  targetTitle: string,
  tracks: Track[],
): Promise<void> {
  const ids = [...new Set(tracks.map((t) => t.videoId))];
  for (let i = 0; i < ids.length; i += 50)
    await addToPlaylist(targetPlaylistId, ids.slice(i, i + 50), targetTitle);
}

export function toCsv(title: string, tracks: Track[]): string {
  const esc = (v: string | number | null | undefined): string =>
    `"${String(v ?? '').replace(/"/gu, '""')}"`;
  const rows = [['title', 'artists', 'album', 'duration_seconds', 'video_id', 'url'].join(',')];
  for (const t of tracks)
    rows.push(
      [
        esc(t.title),
        esc(t.artists.map((a) => a.name).join('; ')),
        esc(t.album?.name),
        esc(t.durationSeconds),
        esc(t.videoId),
        esc(`https://music.youtube.com/watch?v=${t.videoId}`),
      ].join(','),
    );
  return `# ${title}\n${rows.join('\n')}\n`;
}

/** An M3U8 playlist whose entries are the songs' YouTube Music links, with title and artist in the EXTINF line. */
export function toM3u8(title: string, tracks: Track[]): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${title}`];
  for (const t of tracks) {
    const artist = t.artists.map((a) => a.name).join(', ');
    lines.push(
      `#EXTINF:${String(Math.round(t.durationSeconds ?? -1))},${artist ? `${artist} - ` : ''}${t.title}`,
      `https://music.youtube.com/watch?v=${t.videoId}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

export function toJson(title: string, tracks: Track[]): string {
  return JSON.stringify(
    {
      title,
      exportedAt: new Date().toISOString(),
      tracks: tracks.map((t) => ({
        title: t.title,
        artists: t.artists.map((a) => a.name),
        album: t.album?.name ?? null,
        durationSeconds: t.durationSeconds,
        videoId: t.videoId,
        url: `https://music.youtube.com/watch?v=${t.videoId}`,
      })),
    },
    null,
    2,
  );
}

/** Metadata-only export (no audio) to a file the user picks. */
export async function exportPlaylist(
  title: string,
  tracks: Track[],
  format: 'csv' | 'json' | 'm3u8',
): Promise<void> {
  const safe = title.replace(/[\\/:*?"<>|]+/gu, ' ').trim() || 'playlist';
  const path = await save({
    defaultPath: `${safe}.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (!path) return;
  const text =
    format === 'csv'
      ? toCsv(title, tracks)
      : format === 'm3u8'
        ? toM3u8(title, tracks)
        : toJson(title, tracks);
  await writeTextFile(path, text);
  toast(t('toast.exported', { count: tracks.length }));
}
