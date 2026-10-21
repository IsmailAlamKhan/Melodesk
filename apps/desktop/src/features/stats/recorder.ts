/**
 * Local listening history, written to SQLite from bridge events. Nothing leaves the machine.
 * One row per play (a track starting), with listened seconds accumulated while it plays.
 */
import { db } from '../../data/persister';
import { usePlayerStore } from '../../player/store';

const FLUSH_MS = 10_000;

export function startHistoryRecorder(): () => void {
  let rowId: number | null = null;
  let currentId: string | null = null;
  let listened = 0;
  let lastTick = Date.now();
  let dirty = false;

  const flush = async (): Promise<void> => {
    if (rowId === null || !dirty) return;
    dirty = false;
    await (
      await db()
    ).execute('UPDATE history SET listened_seconds = $1 WHERE id = $2', [
      Math.round(listened),
      rowId,
    ]);
  };

  const unsub = usePlayerStore.subscribe((s, prev) => {
    const now = Date.now();
    const track = s.track;
    if (track?.videoId !== currentId) {
      void flush();
      currentId = track?.videoId ?? null;
      rowId = null;
      listened = 0;
      lastTick = now;
      if (track?.videoId) {
        const t = track;
        void (async () => {
          const res = await (
            await db()
          ).execute(
            'INSERT INTO history (video_id, title, artist, album, artwork_url, duration_seconds, played_at, listened_seconds) VALUES ($1, $2, $3, $4, $5, $6, $7, 0)',
            [
              t.videoId,
              t.title,
              t.artist,
              t.album,
              t.artworkUrl,
              s.state?.duration ? Math.round(s.state.duration) : null,
              now,
            ],
          );
          if (currentId === t.videoId) rowId = res.lastInsertId ?? null;
        })();
      }
      return;
    }
    if (s.state !== prev.state && s.state) {
      if (prev.state?.playing) listened += Math.min((now - lastTick) / 1000, 5);
      lastTick = now;
      dirty = true;
    }
  });
  const timer = window.setInterval(() => void flush(), FLUSH_MS);
  return () => {
    unsub();
    window.clearInterval(timer);
    void flush();
  };
}
