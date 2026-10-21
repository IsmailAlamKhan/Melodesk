import { Button, IconButton } from '@melodesk/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, X } from 'lucide-react';
import { Img } from '../../core';
import { useT } from '../../i18n/index';
import { sendCommand } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { forget, loadSaved, type SavedListen } from './saved';

const SEEK_WAIT_MS = 20_000;

/** Play the saved song through the page's own endpoint, then jump to where it was. */
export async function resume(saved: SavedListen): Promise<void> {
  const endpoint = saved.endpoint ?? { watchEndpoint: { videoId: saved.videoId } };
  await sendCommand({ type: 'endpoint', endpoint, mode: 'navigate' });
  if (saved.position < 5) return;
  // The player needs a moment to load the song before it can be moved.
  const stop = usePlayerStore.subscribe((s) => {
    if (s.track?.videoId === saved.videoId && (s.state?.duration ?? 0) > 0) {
      stop();
      void sendCommand({ type: 'seek', seconds: saved.position });
    }
  });
  window.setTimeout(stop, SEEK_WAIT_MS);
}

const clock = (s: number): string =>
  `${String(Math.floor(s / 60))}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** "Continue listening": the song you were in the middle of when Melodesk last ran. */
export function ResumeCard() {
  const t = useT();
  const qc = useQueryClient();
  const ready = usePlayerStore((s) => s.ready);
  const playing = usePlayerStore((s) => s.track !== null);
  const { data } = useQuery({ queryKey: ['resume'], queryFn: loadSaved, staleTime: Infinity });
  // Once something is playing there is nothing to resume.
  if (!data || playing) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-bg-elevated p-3">
      {data.artworkUrl ? (
        <Img src={data.artworkUrl} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="size-14 shrink-0 rounded-lg bg-bg-overlay" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
          {t('resume.title')}
        </div>
        <div className="truncate text-sm font-semibold">{data.title}</div>
        <div className="truncate text-xs text-fg-muted">
          {data.artist.split(' • ')[0]} · {t('resume.at', { time: clock(data.position) })}
        </div>
      </div>
      <Button variant="primary" disabled={!ready} onClick={() => void resume(data)}>
        <Play className="size-4" />
        {t('resume.play')}
      </Button>
      <IconButton
        label={t('resume.dismiss')}
        size="sm"
        onClick={() => {
          void forget();
          qc.setQueryData(['resume'], null);
        }}
      >
        <X />
      </IconButton>
    </div>
  );
}
