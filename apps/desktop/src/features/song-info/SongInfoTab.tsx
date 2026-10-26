import { useQuery } from '@tanstack/react-query';
import { openUrl } from '@tauri-apps/plugin-opener';
import { infoSources, useSourceActive } from '../../core';
import { useT } from '../../i18n/index';
import { usePlayerStore } from '../../player/store';

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <dt className="w-28 shrink-0 text-fg-subtle">{label}</dt>
      <dd className="min-w-0 flex-1 text-fg">{value}</dd>
    </div>
  );
}

/** Facts about the playing song and its artist, from an open database, once the user allows it. */
export function SongInfoTab() {
  const t = useT();
  const track = usePlayerStore((s) => s.track);
  const source = infoSources.useAll()[0];
  const on = useSourceActive(source);
  const key = track ? `${track.videoId ?? ''}|${track.title}|${track.artist}` : '';
  const q = useQuery({
    queryKey: ['song-info', key],
    enabled: on && !!track && !!source,
    staleTime: Infinity,
    queryFn: () =>
      track && source
        ? source.songInfo({
            videoId: track.videoId ?? '',
            title: track.title,
            artist: track.artist,
            album: track.album,
            artworkUrl: track.artworkUrl,
            durationSeconds: null,
          })
        : null,
  });
  if (!track) return <p className="p-4 text-sm text-fg-muted">{t('songInfo.nothing')}</p>;
  if (!source) return null;
  if (!on)
    return (
      <div className="flex flex-col gap-3 p-4 text-sm text-fg-muted">
        <p>{t('songInfo.optIn', { name: source.label })}</p>
        <button
          type="button"
          onClick={() => {
            source.activate();
          }}
          className="h-9 self-start rounded-md bg-fg px-4 text-sm font-medium text-bg hover:opacity-90"
        >
          {t('songInfo.enable', { name: source.label })}
        </button>
      </div>
    );
  if (q.isLoading) return <p className="p-4 text-sm text-fg-muted">{t('songInfo.loading')}</p>;
  const info = q.data;
  if (!info) return <p className="p-4 text-sm text-fg-muted">{t('songInfo.none')}</p>;
  const a = info.artistDetails;
  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      <section>
        <h3 className="font-display text-lg font-semibold">{info.title}</h3>
        <dl className="mt-1">
          <Row label={t('songInfo.artist')} value={info.artist} />
          <Row label={t('songInfo.album')} value={info.album} />
          <Row label={t('songInfo.released')} value={info.released} />
          <Row label={t('songInfo.genres')} value={info.genres.join(', ')} />
        </dl>
      </section>
      {a && (
        <section>
          <h3 className="font-display text-lg font-semibold">{info.artist}</h3>
          <dl className="mt-1">
            <Row label={t('songInfo.kind')} value={a.kind} />
            <Row label={t('songInfo.country')} value={a.country} />
            <Row label={t('songInfo.active')} value={a.active} />
            <Row label={t('songInfo.genres')} value={a.genres.join(', ')} />
            <Row label={t('songInfo.note')} value={a.note} />
          </dl>
        </section>
      )}
      <ul className="flex flex-col gap-1">
        {info.links.map((l) => (
          <li key={l.url}>
            <button
              type="button"
              className="text-sm text-accent underline-offset-2 hover:underline"
              onClick={() => void openUrl(l.url)}
            >
              {l.label}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-subtle">{t('songInfo.credit', { name: source.label })}</p>
    </div>
  );
}
