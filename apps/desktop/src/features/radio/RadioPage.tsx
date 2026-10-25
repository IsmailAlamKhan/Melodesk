import { Button, inputClass } from '@melodesk/ui';
import { Play, Plus, Radio, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n/index';
import { Empty } from '../local-music/LocalPage';
import { playList } from '../local-music/TrackRow';
import {
  addStation,
  removeStation,
  searchDirectory,
  stationTrack,
  useStations,
  type Hit,
} from './stations';

/** Internet radio: stations you add, and a directory to find more. */
export function RadioPage() {
  const t = useT();
  const { stations, loaded } = useStations();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fail = (err: unknown): void => {
    setError(err instanceof Error ? err.message : String(err));
  };
  const tracks = stations.map(stationTrack);
  return (
    <div className="flex flex-col gap-5 pb-8">
      <header className="px-4 pt-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t('radio.title')}</h1>
        <p className="mt-1 text-sm text-fg-muted">{t('radio.intro')}</p>
      </header>

      <section className="flex flex-col gap-2 px-4" aria-labelledby="radio-find">
        <h2 id="radio-find" className="text-sm font-semibold">
          {t('radio.find')}
        </h2>
        <form
          className="flex max-w-xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!term.trim()) return;
            setError(null);
            setBusy(true);
            void searchDirectory(term.trim())
              .then(setHits)
              .catch(fail)
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              className={`${inputClass} ps-9`}
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
              }}
              aria-label={t('radio.searchLabel')}
              placeholder={t('radio.searchLabel')}
            />
          </label>
          <Button type="submit" variant="primary" disabled={busy || !term.trim()}>
            {t('radio.search')}
          </Button>
        </form>
        {hits?.length === 0 && <p className="text-sm text-fg-muted">{t('radio.noHits')}</p>}
        {hits?.length ? (
          <ul className="flex max-w-xl flex-col">
            {hits.map((h) => (
              <li
                key={h.url}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-bg-overlay"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{h.name}</span>
                  <span className="block truncate text-xs text-fg-muted">
                    {[h.country, h.detail].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  onClick={() => {
                    void addStation(h.name, h.url).catch(fail);
                  }}
                >
                  <Plus className="size-4" />
                  {t('radio.add')}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-2 px-4" aria-labelledby="radio-own">
        <h2 id="radio-own" className="text-sm font-semibold">
          {t('radio.own')}
        </h2>
        <form
          className="flex max-w-xl flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            void addStation(name, address)
              .then(() => {
                setName('');
                setAddress('');
              })
              .catch(fail);
          }}
        >
          <input
            className={`${inputClass} w-40`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            aria-label={t('radio.name')}
            placeholder={t('radio.name')}
          />
          <input
            className={`${inputClass} min-w-48 flex-1`}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
            }}
            aria-label={t('radio.address')}
            placeholder="https://stream.example.com/live"
            inputMode="url"
          />
          <Button type="submit" variant="ghost" disabled={!address.trim()}>
            <Plus className="size-4" />
            {t('radio.add')}
          </Button>
        </form>
      </section>

      {error && (
        <p role="alert" className="px-4 text-xs text-danger">
          {t('radio.failed', { error })}
        </p>
      )}

      {loaded && stations.length === 0 ? (
        <Empty title={t('radio.empty.title')} body={t('radio.empty.body')} />
      ) : (
        <ul className="px-2" aria-label={t('radio.title')}>
          {stations.map((s, i) => (
            <li
              key={s.url}
              className="group flex h-14 items-center gap-3 rounded-lg px-2 hover:bg-bg-overlay"
            >
              <button
                type="button"
                aria-label={t('radio.play', { name: s.name })}
                onClick={() => {
                  playList(tracks, i);
                }}
                className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-fg hover:scale-105"
              >
                <Play className="size-4 translate-x-px" />
              </button>
              <Radio className="size-4 shrink-0 text-fg-subtle" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.name}</span>
                <span className="block truncate text-xs text-fg-muted">{s.url}</span>
              </span>
              <button
                type="button"
                aria-label={t('radio.remove', { name: s.name })}
                onClick={() => void removeStation(s.url)}
                className="grid size-8 place-items-center rounded-full text-fg-muted opacity-0 hover:text-fg focus-visible:opacity-100 group-hover:opacity-100 max-rail:opacity-100"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
