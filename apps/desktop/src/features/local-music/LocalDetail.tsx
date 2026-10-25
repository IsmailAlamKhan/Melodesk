import { Button } from '@melodesk/ui';
import { ArrowLeft, Play, Shuffle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { useT } from '../../i18n/index';
import { useAlbumTracks, useArtistTracks } from './hooks';
import type { LocalTrack } from './library';
import { Empty, LazyCover } from './LocalPage';
import { playList, TrackRow } from './TrackRow';

function Header({
  title,
  subtitle,
  coverPath,
  tracks,
  round,
}: {
  title: string;
  subtitle: string;
  coverPath: string | undefined;
  tracks: LocalTrack[];
  round?: boolean;
}) {
  const t = useT();
  return (
    <header className="flex flex-col gap-4 px-4 pt-6">
      <Link
        to="/local"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t('local.title')}
      </Link>
      <div className="flex flex-wrap items-end gap-5">
        {coverPath && (
          <LazyCover path={coverPath} round={round ?? false} className="size-40 shadow-xl" />
        )}
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>
          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              disabled={tracks.length === 0}
              onClick={() => {
                playList(tracks, 0);
              }}
            >
              <Play className="size-4" />
              {t('local.play')}
            </Button>
            <Button
              variant="ghost"
              disabled={tracks.length === 0}
              onClick={() => {
                playList(tracks, 0, true);
              }}
            >
              <Shuffle className="size-4" />
              {t('local.shuffle')}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

const minutes = (tracks: LocalTrack[]): number =>
  Math.max(1, Math.round(tracks.reduce((n, x) => n + x.durationMs, 0) / 60_000));

export function LocalAlbumPage() {
  const t = useT();
  const [sp] = useSearchParams();
  const album = sp.get('album') ?? '';
  const artist = sp.get('artist') ?? '';
  const q = useAlbumTracks(album, artist);
  const tracks = q.data ?? [];
  if (q.data && tracks.length === 0)
    return <Empty title={t('local.gone.title')} body={t('local.gone.body')} />;
  return (
    <div className="flex flex-col gap-4 pb-8">
      <Header
        title={album}
        subtitle={`${artist} · ${t('local.songsAndMinutes', { songs: tracks.length, minutes: minutes(tracks) })}`}
        coverPath={tracks[0]?.path}
        tracks={tracks}
      />
      <div role="table" className="px-2">
        {tracks.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            index={i}
            showAlbum={false}
            onPlay={() => {
              playList(tracks, i);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function LocalArtistPage() {
  const t = useT();
  const [sp] = useSearchParams();
  const artist = sp.get('artist') ?? '';
  const q = useArtistTracks(artist);
  const tracks = q.data ?? [];
  if (q.data && tracks.length === 0)
    return <Empty title={t('local.gone.title')} body={t('local.gone.body')} />;
  return (
    <div className="flex flex-col gap-4 pb-8">
      <Header
        title={artist}
        subtitle={t('local.songsAndMinutes', { songs: tracks.length, minutes: minutes(tracks) })}
        coverPath={tracks[0]?.path}
        tracks={tracks}
        round
      />
      <div role="table" className="px-2">
        {tracks.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            index={i}
            onPlay={() => {
              playList(tracks, i);
            }}
          />
        ))}
      </div>
    </div>
  );
}
