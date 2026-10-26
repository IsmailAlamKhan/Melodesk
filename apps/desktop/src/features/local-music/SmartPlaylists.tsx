import { Button, Dialog, inputClass } from '@melodesk/ui';
import { useQuery } from '@tanstack/react-query';
import { ListMusic, Pencil, Play, Plus, Shuffle, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { aiSources, useSourceActive } from '../../core';
import { queryClient } from '../../data/queryClient';
import { useT } from '../../i18n/index';
import { Empty } from './LocalPage';
import {
  loadSmartPlaylists,
  newSmartId,
  rulesFromAi,
  saveSmartPlaylists,
  smartTracks,
  STARTERS,
  type SmartPlaylist,
  type SmartRules,
  type SmartSort,
} from './smart';
import { playList, TrackRow } from './TrackRow';

const refresh = (): void => {
  void queryClient.invalidateQueries({ queryKey: ['local', 'smart'] });
};

export const useSmartPlaylists = () =>
  useQuery({
    queryKey: ['local', 'smart', 'lists'],
    queryFn: loadSmartPlaylists,
    staleTime: Infinity,
  });

/** What a playlist holds right now. It follows the history, so it is not kept for long. */
const useSmartTracks = (rules: SmartRules | null) =>
  useQuery({
    queryKey: ['local', 'smart', 'tracks', JSON.stringify(rules)],
    queryFn: () => (rules ? smartTracks(rules) : Promise.resolve([])),
    enabled: rules !== null,
    staleTime: 15_000,
  });

const SORTS: SmartSort[] = [
  'recentlyAdded',
  'mostPlayed',
  'leastPlayed',
  'lastPlayed',
  'random',
  'title',
  'artist',
];

export const playlistLink = (id: string): string => `/local/playlist?id=${encodeURIComponent(id)}`;

/** The "Playlists" tab of the local page: the user's smart playlists and a way to make more. */
export function PlaylistsTab() {
  const t = useT();
  const lists = useSmartPlaylists();
  const [editing, setEditing] = useState<SmartPlaylist | 'new' | null>(null);
  const items = lists.data ?? [];
  const save = async (next: SmartPlaylist[]): Promise<void> => {
    await saveSmartPlaylists(next);
    refresh();
  };
  const addStarters = async (): Promise<void> => {
    const have = new Set(items.map((p) => p.name));
    const more = STARTERS.map((s) => ({
      id: newSmartId() + s.key,
      name: t(`local.smart.starter.${s.key}`),
      rules: s.rules,
    })).filter((p) => !have.has(p.name));
    await save([...items, ...more]);
  };
  return (
    <div className="flex flex-col gap-3 px-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => {
            setEditing('new');
          }}
        >
          <Plus className="size-4" />
          {t('local.smart.new')}
        </Button>
        <Button variant="ghost" onClick={() => void addStarters()}>
          {t('local.smart.starters')}
        </Button>
      </div>
      {lists.data && items.length === 0 ? (
        <Empty title={t('local.smart.empty.title')} body={t('local.smart.empty.body')} />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
          {items.map((p) => (
            <li key={p.id}>
              <Link
                to={playlistLink(p.id)}
                className="flex h-20 items-center gap-3 rounded-2xl border border-border/50 bg-bg-elevated px-4 outline-none hover:bg-bg-overlay focus-visible:ring-2 focus-visible:ring-accent"
              >
                <ListMusic className="size-6 shrink-0 text-accent" />
                <span className="min-w-0 truncate font-medium">{p.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <SmartEditor
          initial={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
          onSave={async (p) => {
            await save(
              editing === 'new' ? [...items, p] : items.map((x) => (x.id === p.id ? p : x)),
            );
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

const num = (s: string): number | undefined => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const str = (n: number | undefined): string => (n === undefined ? '' : String(n));

function SmartEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: SmartPlaylist | null;
  onClose: () => void;
  onSave: (p: SmartPlaylist) => Promise<void>;
}) {
  const t = useT();
  const r = initial?.rules;
  const [name, setName] = useState(initial?.name ?? '');
  const [text, setText] = useState(r?.text ?? '');
  const [genre, setGenre] = useState(r?.genre ?? '');
  const [yearFrom, setYearFrom] = useState(str(r?.yearFrom));
  const [yearTo, setYearTo] = useState(str(r?.yearTo));
  const [minPlays, setMinPlays] = useState(str(r?.minPlays));
  const [maxPlays, setMaxPlays] = useState(str(r?.maxPlays));
  const [notPlayed, setNotPlayed] = useState(str(r?.notPlayedDays));
  const [playedWithin, setPlayedWithin] = useState(str(r?.playedWithinDays));
  const [addedWithin, setAddedWithin] = useState(str(r?.addedWithinDays));
  const [sort, setSort] = useState<SmartSort>(r?.sort ?? 'recentlyAdded');
  const [limit, setLimit] = useState(str(r?.limit ?? 100));
  const [saving, setSaving] = useState(false);
  const ai = aiSources.useAll()[0];
  const aiOn = useSourceActive(ai);
  const [described, setDescribed] = useState('');
  const [asking, setAsking] = useState(false);
  const [aiError, setAiError] = useState(false);
  const fillFromAi = async (): Promise<void> => {
    if (!ai) return;
    setAsking(true);
    setAiError(false);
    const found = rulesFromAi(await ai.suggestRules(described.trim()));
    setAsking(false);
    if (!found) {
      setAiError(true);
      return;
    }
    setText(found.text ?? '');
    setGenre(found.genre ?? '');
    setYearFrom(str(found.yearFrom));
    setYearTo(str(found.yearTo));
    setMinPlays(str(found.minPlays));
    setMaxPlays(str(found.maxPlays));
    setNotPlayed(str(found.notPlayedDays));
    setPlayedWithin(str(found.playedWithinDays));
    setAddedWithin(str(found.addedWithinDays));
    setSort(found.sort);
    setLimit(str(found.limit ?? 100));
    if (!name.trim()) setName(described.trim().slice(0, 40));
  };

  const [yf, yt, mi, ma, np, pw, aw, lm] = [
    num(yearFrom),
    num(yearTo),
    num(minPlays),
    num(maxPlays),
    num(notPlayed),
    num(playedWithin),
    num(addedWithin),
    num(limit),
  ];
  const rules: SmartRules = {
    ...(text.trim() ? { text } : {}),
    ...(genre.trim() ? { genre } : {}),
    ...(yf !== undefined ? { yearFrom: yf } : {}),
    ...(yt !== undefined ? { yearTo: yt } : {}),
    ...(mi !== undefined ? { minPlays: mi } : {}),
    ...(ma !== undefined ? { maxPlays: ma } : {}),
    ...(np !== undefined ? { notPlayedDays: np } : {}),
    ...(pw !== undefined ? { playedWithinDays: pw } : {}),
    ...(aw !== undefined ? { addedWithinDays: aw } : {}),
    ...(lm !== undefined ? { limit: lm } : {}),
    sort,
  };
  // The preview follows the rules after a short pause.
  const [previewRules, setPreviewRules] = useState<SmartRules>(rules);
  const key = JSON.stringify(rules);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPreviewRules(JSON.parse(key) as SmartRules);
    }, 300);
    return () => {
      window.clearTimeout(timer);
    };
  }, [key]);
  const preview = useSmartTracks(previewRules);

  const field = (label: string, value: string, set: (v: string) => void, numeric = false) => (
    <label className="flex flex-col gap-1 text-xs text-fg-muted">
      {label}
      <input
        className={inputClass}
        value={value}
        inputMode={numeric ? 'decimal' : 'text'}
        onChange={(e) => {
          set(e.target.value);
        }}
      />
    </label>
  );

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !saving) onClose();
      }}
      title={initial ? t('local.smart.edit') : t('local.smart.new')}
      description={t('local.smart.hint')}
      className="max-h-[90vh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto"
      closeLabel={t('common.cancel')}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSaving(true);
          void onSave({ id: initial?.id ?? newSmartId(), name: name.trim(), rules });
        }}
      >
        {aiOn && (
          <div className="flex flex-col gap-1 rounded-lg bg-bg-overlay p-3">
            <label className="flex flex-col gap-1 text-xs text-fg-muted">
              {t('local.smart.ai.label')}
              <span className="flex gap-2">
                <input
                  className={inputClass}
                  value={described}
                  placeholder={t('local.smart.ai.placeholder')}
                  onChange={(e) => {
                    setDescribed(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (described.trim() && !asking) void fillFromAi();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={asking || !described.trim()}
                  onClick={() => {
                    void fillFromAi();
                  }}
                >
                  {asking ? t('local.smart.ai.thinking') : t('local.smart.ai.fill')}
                </Button>
              </span>
            </label>
            <span className="text-xs text-fg-subtle">{t('local.smart.ai.hint')}</span>
            {aiError && (
              <span role="alert" className="text-xs text-danger">
                {t('local.smart.ai.failed')}
              </span>
            )}
          </div>
        )}
        {field(t('local.smart.name'), name, setName)}
        {field(t('local.smart.text'), text, setText)}
        <div className="grid grid-cols-3 gap-3">
          {field(t('local.smart.genre'), genre, setGenre)}
          {field(t('local.smart.yearFrom'), yearFrom, setYearFrom, true)}
          {field(t('local.smart.yearTo'), yearTo, setYearTo, true)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field(t('local.smart.minPlays'), minPlays, setMinPlays, true)}
          {field(t('local.smart.maxPlays'), maxPlays, setMaxPlays, true)}
          {field(t('local.smart.notPlayed'), notPlayed, setNotPlayed, true)}
          {field(t('local.smart.playedWithin'), playedWithin, setPlayedWithin, true)}
          {field(t('local.smart.addedWithin'), addedWithin, setAddedWithin, true)}
          {field(t('local.smart.limit'), limit, setLimit, true)}
        </div>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          {t('local.smart.sort')}
          <select
            className={inputClass}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SmartSort);
            }}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`local.smart.sort.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm" role="status">
          {preview.data ? t('local.smart.preview', { count: preview.data.length }) : '…'}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
            {t('local.smart.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function SmartPlaylistPage() {
  const t = useT();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const id = sp.get('id') ?? '';
  const lists = useSmartPlaylists();
  const playlist = lists.data?.find((p) => p.id === id) ?? null;
  const tracks = useSmartTracks(playlist?.rules ?? null);
  const [editing, setEditing] = useState(false);
  const list = tracks.data ?? [];
  if (lists.data && !playlist)
    return <Empty title={t('local.gone.title')} body={t('local.smart.gone')} />;
  return (
    <div className="flex flex-col gap-4 pb-8">
      <header className="flex flex-col gap-3 px-4 pt-6">
        <Link to="/local?tab=playlists" className="w-fit text-sm text-fg-muted hover:text-fg">
          {t('local.title')}
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-tight">{playlist?.name ?? ''}</h1>
        <p className="text-sm text-fg-muted">{t('local.count', { count: list.length })}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={list.length === 0}
            onClick={() => {
              playList(list, 0);
            }}
          >
            <Play className="size-4" />
            {t('local.play')}
          </Button>
          <Button
            variant="ghost"
            disabled={list.length === 0}
            onClick={() => {
              playList(list, 0, true);
            }}
          >
            <Shuffle className="size-4" />
            {t('local.shuffle')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setEditing(true);
            }}
          >
            <Pencil className="size-4" />
            {t('local.smart.edit')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void saveSmartPlaylists((lists.data ?? []).filter((p) => p.id !== id)).then(() => {
                refresh();
                void navigate('/local?tab=playlists');
              });
            }}
          >
            <Trash2 className="size-4" />
            {t('local.smart.delete')}
          </Button>
        </div>
      </header>
      <div role="table" className="px-2">
        {list.map((track, i) => (
          <TrackRow
            key={track.id}
            track={track}
            index={i}
            onPlay={() => {
              playList(list, i);
            }}
          />
        ))}
      </div>
      {editing && playlist && (
        <SmartEditor
          initial={playlist}
          onClose={() => {
            setEditing(false);
          }}
          onSave={async (p) => {
            await saveSmartPlaylists((lists.data ?? []).map((x) => (x.id === p.id ? p : x)));
            refresh();
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
