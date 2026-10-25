import { Button, inputClass } from '@melodesk/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Play, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useT } from '../../i18n/index';
import { Empty, LazyCover } from '../local-music/LocalPage';
import { remoteId, remoteTrack } from '../local-music/remote';
import { playList, TrackRow } from '../local-music/TrackRow';
import type { LocalTrack } from '../local-music/library';
import type { Episode, PodcastHit } from './rss';
import { fetchFeed, searchDirectory, subscribe, unsubscribe, usePodcasts } from './store';

const showLink = (url: string): string => `/podcasts/show?url=${encodeURIComponent(url)}`;
const looksLikeAddress = (text: string): boolean => /^https?:\/\//iu.test(text.trim());

/** A podcast episode as a song the player can queue. */
export function episodeTrack(
  feedUrl: string,
  show: string,
  image: string | null,
  e: Episode,
): LocalTrack {
  const key = `podcast:${feedUrl}:${e.guid}`;
  return remoteTrack({
    key,
    title: e.title,
    artist: show,
    album: show,
    durationMs: e.durationSeconds * 1000,
    source: {
      url: e.audioUrl,
      mime: e.mime,
      openRedirects: true,
      resumeKey: String(remoteId(key)),
      ...((e.image ?? image) ? { coverUrl: e.image ?? image ?? '' } : {}),
    },
  });
}

function AddPodcast() {
  const t = useT();
  const [text, setText] = useState('');
  const [hits, setHits] = useState<PodcastHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (): Promise<void> => {
    setError(null);
    setHits(null);
    setBusy(true);
    try {
      if (looksLikeAddress(text)) {
        await subscribe(text);
        setText('');
      } else setHits(await searchDirectory(text.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 px-4">
      <form
        className="flex max-w-xl gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void run();
        }}
      >
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            className={`${inputClass} ps-9`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            aria-label={t('podcasts.add.label')}
            placeholder={t('podcasts.add.label')}
          />
        </label>
        <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
          {looksLikeAddress(text) ? t('podcasts.subscribe') : t('podcasts.search')}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {t('podcasts.failed', { error })}
        </p>
      )}
      {hits?.length === 0 && <p className="text-sm text-fg-muted">{t('podcasts.noHits')}</p>}
      {hits?.length ? (
        <ul className="flex max-w-xl flex-col">
          {hits.map((h) => (
            <li
              key={h.feedUrl}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-bg-overlay"
            >
              <LazyCover path={h.image ?? ''} className="size-12" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{h.title}</span>
                <span className="block truncate text-xs text-fg-muted">{h.author}</span>
              </span>
              <Button
                variant="ghost"
                onClick={() => {
                  setBusy(true);
                  void subscribe(h.feedUrl)
                    .then(() => {
                      setHits(null);
                    })
                    .catch((err: unknown) => {
                      setError(err instanceof Error ? err.message : String(err));
                    })
                    .finally(() => {
                      setBusy(false);
                    });
                }}
              >
                <Plus className="size-4" />
                {t('podcasts.subscribe')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Podcasts you follow, by feed. */
export function PodcastsPage() {
  const t = useT();
  const { feeds, loaded } = usePodcasts();
  return (
    <div className="flex flex-col gap-4 pb-8">
      <header className="px-4 pt-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t('podcasts.title')}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t('podcasts.intro')}</p>
      </header>
      <AddPodcast />
      {loaded && feeds.length === 0 ? (
        <Empty title={t('podcasts.empty.title')} body={t('podcasts.empty.body')} />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4 px-4">
          {feeds.map((f) => (
            <li key={f.url}>
              <Link
                to={showLink(f.url)}
                className="flex flex-col gap-2 rounded-xl p-2 outline-none hover:bg-bg-overlay focus-visible:ring-2 focus-visible:ring-accent"
              >
                <LazyCover path={f.image ?? ''} className="aspect-square w-full" />
                <span className="truncate text-sm font-semibold">{f.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One show: its episodes, newest first. */
export function ShowPage() {
  const t = useT();
  const navigate = useNavigate();
  const url = useSearchParams()[0].get('url') ?? '';
  const sub = usePodcasts((s) => s.feeds.find((f) => f.url === url));
  const q = useQuery({
    queryKey: ['podcast', url],
    queryFn: () => fetchFeed(url),
    enabled: !!sub,
    staleTime: 5 * 60_000,
  });
  if (!sub) return <Empty title={t('local.gone.title')} body={t('podcasts.gone')} />;
  const feed = q.data;
  const tracks = (feed?.episodes ?? []).map((e) =>
    episodeTrack(url, feed?.title ?? sub.title, feed?.image ?? sub.image, e),
  );
  return (
    <div className="flex flex-col gap-4 pb-8">
      <header className="flex flex-col gap-4 px-4 pt-6">
        <Link
          to="/podcasts"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="size-4 rtl:rotate-180" />
          {t('podcasts.title')}
        </Link>
        <div className="flex flex-wrap items-end gap-5">
          <LazyCover path={sub.image ?? ''} className="size-36 shadow-xl" />
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold tracking-tight">
              {feed?.title ?? sub.title}
            </h1>
            <p className="mt-1 text-sm text-fg-muted">{feed?.author}</p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="primary"
                disabled={tracks.length === 0}
                onClick={() => {
                  playList(tracks, 0);
                }}
              >
                <Play className="size-4" />
                {t('podcasts.playLatest')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  void unsubscribe(url).then(() => navigate('/podcasts'));
                }}
              >
                <Trash2 className="size-4" />
                {t('podcasts.unsubscribe')}
              </Button>
            </div>
          </div>
        </div>
      </header>
      {q.error && (
        <p role="alert" className="px-4 text-sm text-danger">
          {t('podcasts.failed', {
            error: q.error instanceof Error ? q.error.message : String(q.error),
          })}
        </p>
      )}
      <div role="table" className="px-2">
        {tracks.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            index={i}
            showAlbum={false}
            showArtist={false}
            onPlay={() => {
              playList(tracks.slice(i), 0);
            }}
          />
        ))}
      </div>
    </div>
  );
}
