import { Button, inputClass } from '@melodesk/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Play, Plug, Search, Shuffle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useT } from '../../i18n/index';
import { allowHosts } from '../../net/allow';
import { LazyCover, Empty } from '../local-music/LocalPage';
import { remoteTrack } from '../local-music/remote';
import { playList, TrackRow } from '../local-music/TrackRow';
import { saveServer, useServer } from './config';
import {
  api,
  baseUrl,
  coverUrl,
  toRemoteSong,
  type AlbumListType,
  type ServerAlbum,
  type ServerConfig,
  type ServerSong,
} from './subsonic';

const tracksOf = (cfg: ServerConfig, songs: ServerSong[]) =>
  songs.map((s) => remoteTrack(toRemoteSong(cfg, s)));

const albumLink = (id: string): string => `/server/album?id=${encodeURIComponent(id)}`;
const artistLink = (id: string): string => `/server/artist?id=${encodeURIComponent(id)}`;
const playlistLink = (id: string): string => `/server/playlist?id=${encodeURIComponent(id)}`;

/** The identity of a login, so a different server never shows the last one's lists. */
const who = (c: ServerConfig): string => `${c.url}|${c.user}`;

/** Address, user and password of the user's own server, tried before it is saved. */
export function ConnectForm({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const saved = useServer((s) => s.config);
  const [url, setUrl] = useState(saved?.url ?? '');
  const [user, setUser] = useState(saved?.user ?? '');
  const [password, setPassword] = useState(saved?.password ?? '');
  const [state, setState] = useState<'idle' | 'trying' | 'ok' | 'failed'>('idle');
  const [error, setError] = useState('');
  const connect = async (): Promise<void> => {
    setState('trying');
    const cfg = { url: url.trim(), user: user.trim(), password };
    try {
      // The host must be allowed before anything can be fetched from it; the details are only kept
      // once the server has accepted them (keeping them first would swap this form for the browser).
      await allowHosts('server', [baseUrl(cfg.url)]);
      await api.ping(cfg);
      await saveServer(cfg);
      setState('ok');
      onDone?.();
    } catch (err) {
      await allowHosts('server', saved ? [baseUrl(saved.url)] : []);
      setError(err instanceof Error ? err.message : String(err));
      setState('failed');
    }
  };
  return (
    <form
      className="flex max-w-md flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void connect();
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-fg-muted">
        {t('server.url')}
        <input
          className={inputClass}
          value={url}
          placeholder="https://music.example.com"
          inputMode="url"
          onChange={(e) => {
            setUrl(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-fg-muted">
        {t('server.user')}
        <input
          className={inputClass}
          value={user}
          autoComplete="off"
          onChange={(e) => {
            setUser(e.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-fg-muted">
        {t('server.password')}
        <input
          className={inputClass}
          type="password"
          value={password}
          autoComplete="off"
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
      </label>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={!url.trim() || !user.trim() || state === 'trying'}
        >
          <Plug className="size-4" />
          {state === 'trying' ? t('server.connecting') : t('server.connect')}
        </Button>
        {saved && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              void saveServer(null);
              setUrl('');
              setUser('');
              setPassword('');
              setState('idle');
            }}
          >
            {t('server.disconnect')}
          </Button>
        )}
        {state === 'ok' && (
          <span className="flex items-center gap-1 text-xs text-accent" role="status">
            <Check className="size-4" />
            {t('server.connected')}
          </span>
        )}
      </div>
      {state === 'failed' && (
        <p role="alert" className="text-xs text-danger">
          {t('server.failed', { error })}
        </p>
      )}
      <p className="text-xs text-fg-subtle">{t('server.passwordNote')}</p>
    </form>
  );
}

type Tab = 'albums' | 'artists' | 'playlists' | 'search';
const TABS: Tab[] = ['albums', 'artists', 'playlists', 'search'];
const LISTS: AlbumListType[] = ['newest', 'recent', 'frequent', 'random', 'alphabeticalByName'];

/** The user's own music server: albums, artists, playlists and search. */
export function ServerPage() {
  const t = useT();
  const { config, loaded } = useServer();
  const [sp, setSp] = useSearchParams();
  const tab = TABS.find((x) => x === sp.get('tab')) ?? 'albums';
  if (!loaded) return null;
  if (!config)
    return (
      <div className="flex flex-col gap-4 px-4 pt-6 pb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t('server.title')}</h1>
        <p className="max-w-lg text-sm text-fg-muted">{t('server.intro')}</p>
        <ConnectForm />
      </div>
    );
  return (
    <div className="flex flex-col gap-4 pb-8">
      <header className="px-4 pt-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t('server.title')}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {config.user} · {config.url.replace(/^https?:\/\//u, '')}
        </p>
      </header>
      <div role="tablist" className="flex gap-2 px-4">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setSp({ tab: id }, { replace: true });
            }}
            className={
              tab === id
                ? 'h-9 rounded-full bg-accent px-4 text-sm font-medium text-accent-fg'
                : 'h-9 rounded-full bg-bg-overlay px-4 text-sm font-medium text-fg hover:bg-accent-soft'
            }
          >
            {t(`server.tab.${id}`)}
          </button>
        ))}
      </div>
      {tab === 'albums' && <Albums cfg={config} />}
      {tab === 'artists' && <Artists cfg={config} />}
      {tab === 'playlists' && <Playlists cfg={config} />}
      {tab === 'search' && <SearchTab cfg={config} />}
    </div>
  );
}

function Failure({ error }: { error: unknown }) {
  const t = useT();
  return (
    <p role="alert" className="px-4 text-sm text-danger">
      {t('server.failed', { error: error instanceof Error ? error.message : String(error) })}
    </p>
  );
}

function AlbumGrid({ cfg, albums }: { cfg: ServerConfig; albums: ServerAlbum[] }) {
  const t = useT();
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4 px-4">
      {albums.map((a) => (
        <li key={a.id}>
          <div className="group relative">
            <Link
              to={albumLink(a.id)}
              className="flex flex-col gap-2 rounded-xl p-2 outline-none hover:bg-bg-overlay focus-visible:ring-2 focus-visible:ring-accent"
            >
              <LazyCover
                path={coverUrl(cfg, a.coverArt, 400) ?? ''}
                className="aspect-square w-full"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{a.name}</div>
                <div className="truncate text-xs text-fg-muted">
                  {a.artist}
                  {a.year ? ` · ${String(a.year)}` : ''}
                </div>
              </div>
            </Link>
            <button
              type="button"
              aria-label={t('local.playAlbum', { title: a.name })}
              onClick={() => {
                void api.album(cfg, a.id).then((r) => {
                  playList(tracksOf(cfg, r.songs), 0);
                });
              }}
              className="absolute end-4 top-[calc(100%-5.5rem)] hidden size-10 items-center justify-center rounded-full bg-accent text-accent-fg shadow-xl hover:scale-105 focus-visible:flex group-hover:flex"
            >
              <Play className="size-5 translate-x-px" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Albums({ cfg }: { cfg: ServerConfig }) {
  const t = useT();
  const [type, setType] = useState<AlbumListType>('newest');
  const q = useQuery({
    queryKey: ['server', who(cfg), 'albums', type],
    queryFn: () => api.albums(cfg, type),
    staleTime: 60_000,
  });
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 px-4 text-sm">
        <span className="text-fg-muted">{t('server.order')}</span>
        <select
          className={`${inputClass} h-9 w-auto`}
          value={type}
          onChange={(e) => {
            setType(e.target.value as AlbumListType);
          }}
        >
          {LISTS.map((l) => (
            <option key={l} value={l}>
              {t(`server.list.${l}`)}
            </option>
          ))}
        </select>
      </label>
      {q.error ? <Failure error={q.error} /> : <AlbumGrid cfg={cfg} albums={q.data ?? []} />}
    </div>
  );
}

function Artists({ cfg }: { cfg: ServerConfig }) {
  const t = useT();
  const q = useQuery({
    queryKey: ['server', who(cfg), 'artists'],
    queryFn: () => api.artists(cfg),
    staleTime: 5 * 60_000,
  });
  if (q.error) return <Failure error={q.error} />;
  return (
    <ul className="px-2">
      {(q.data ?? []).map((a) => (
        <li key={a.id}>
          <Link
            to={artistLink(a.id)}
            className="flex h-14 items-center gap-3 rounded-lg px-2 outline-none hover:bg-bg-overlay focus-visible:ring-2 focus-visible:ring-accent"
          >
            <LazyCover path={coverUrl(cfg, a.coverArt, 120) ?? ''} round className="size-10" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</span>
            <span className="text-xs text-fg-subtle">
              {t('server.albumCount', { count: a.albumCount })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Playlists({ cfg }: { cfg: ServerConfig }) {
  const t = useT();
  const q = useQuery({
    queryKey: ['server', who(cfg), 'playlists'],
    queryFn: () => api.playlists(cfg),
    staleTime: 60_000,
  });
  if (q.error) return <Failure error={q.error} />;
  if (q.data?.length === 0)
    return <Empty title={t('server.noPlaylists')} body={t('server.noPlaylistsBody')} />;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3 px-4">
      {(q.data ?? []).map((p) => (
        <li key={p.id}>
          <Link
            to={playlistLink(p.id)}
            className="flex h-16 flex-col justify-center rounded-2xl border border-border/50 bg-bg-elevated px-4 outline-none hover:bg-bg-overlay focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="truncate font-medium">{p.name}</span>
            <span className="text-xs text-fg-muted">
              {t('local.count', { count: p.songCount })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SearchTab({ cfg }: { cfg: ServerConfig }) {
  const t = useT();
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(typed.trim());
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [typed]);
  const q = useQuery({
    queryKey: ['server', who(cfg), 'search', query],
    queryFn: () => api.search(cfg, query),
    enabled: query.length > 1,
    staleTime: 60_000,
  });
  const songs = q.data ? tracksOf(cfg, q.data.songs) : [];
  return (
    <div className="flex flex-col gap-3">
      <label className="relative mx-4 max-w-sm">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <input
          type="search"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
          }}
          aria-label={t('server.search')}
          placeholder={t('server.search')}
          className="h-9 w-full rounded-full bg-bg-overlay ps-9 pe-3 text-sm outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-accent"
        />
      </label>
      {q.error && <Failure error={q.error} />}
      {q.data && q.data.albums.length > 0 && <AlbumGrid cfg={cfg} albums={q.data.albums} />}
      <div role="table" className="px-2">
        {songs.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            index={i}
            onPlay={() => {
              playList(songs, i);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Header({
  title,
  subtitle,
  cover,
  tracks,
  back,
}: {
  title: string;
  subtitle: string;
  cover?: string | undefined;
  tracks: ReturnType<typeof tracksOf>;
  back: string;
}) {
  const t = useT();
  return (
    <header className="flex flex-col gap-4 px-4 pt-6">
      <Link
        to={back}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {t('server.title')}
      </Link>
      <div className="flex flex-wrap items-end gap-5">
        {cover && <LazyCover path={cover} className="size-40 shadow-xl" />}
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

function SongList({ tracks }: { tracks: ReturnType<typeof tracksOf> }) {
  return (
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
  );
}

export function ServerAlbumPage() {
  const t = useT();
  const cfg = useServer((s) => s.config);
  const id = useSearchParams()[0].get('id') ?? '';
  const q = useQuery({
    queryKey: ['server', cfg ? who(cfg) : '', 'album', id],
    queryFn: () => (cfg ? api.album(cfg, id) : Promise.reject(new Error('no server'))),
    enabled: !!cfg,
  });
  if (!cfg) return null;
  if (q.error) return <Failure error={q.error} />;
  const tracks = tracksOf(cfg, q.data?.songs ?? []);
  return (
    <div className="flex flex-col gap-4 pb-8">
      <Header
        title={q.data?.album.name ?? ''}
        subtitle={
          q.data ? `${q.data.album.artist} · ${t('local.count', { count: tracks.length })}` : ''
        }
        cover={coverUrl(cfg, q.data?.album.coverArt ?? null)}
        tracks={tracks}
        back="/server"
      />
      <SongList tracks={tracks} />
    </div>
  );
}

export function ServerArtistPage() {
  const cfg = useServer((s) => s.config);
  const id = useSearchParams()[0].get('id') ?? '';
  const q = useQuery({
    queryKey: ['server', cfg ? who(cfg) : '', 'artist', id],
    queryFn: () => (cfg ? api.artistAlbums(cfg, id) : Promise.reject(new Error('no server'))),
    enabled: !!cfg,
  });
  if (!cfg) return null;
  return (
    <div className="flex flex-col gap-4 pb-8">
      <header className="px-4 pt-6">
        <Link to="/server?tab=artists" className="text-sm text-fg-muted hover:text-fg">
          ←
        </Link>
      </header>
      {q.error ? <Failure error={q.error} /> : <AlbumGrid cfg={cfg} albums={q.data ?? []} />}
    </div>
  );
}

export function ServerPlaylistPage() {
  const t = useT();
  const cfg = useServer((s) => s.config);
  const id = useSearchParams()[0].get('id') ?? '';
  const q = useQuery({
    queryKey: ['server', cfg ? who(cfg) : '', 'playlist', id],
    queryFn: () => (cfg ? api.playlist(cfg, id) : Promise.reject(new Error('no server'))),
    enabled: !!cfg,
  });
  if (!cfg) return null;
  if (q.error) return <Failure error={q.error} />;
  const tracks = tracksOf(cfg, q.data?.songs ?? []);
  return (
    <div className="flex flex-col gap-4 pb-8">
      <Header
        title={q.data?.playlist.name ?? ''}
        subtitle={t('local.count', { count: tracks.length })}
        tracks={tracks}
        back="/server?tab=playlists"
      />
      <SongList tracks={tracks} />
    </div>
  );
}
