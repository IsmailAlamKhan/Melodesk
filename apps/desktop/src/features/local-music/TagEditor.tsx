import { Button, Dialog, inputClass } from '@melodesk/ui';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { create } from 'zustand';
import { toast } from '../../app/toast';
import { queryClient } from '../../data/queryClient';
import { useT } from '../../i18n/index';
import { upsertTracks, type LocalTrack, type ScannedTrack } from './library';

/** Which song's tags are being edited (null: the editor is closed). */
export const useTagEditor = create<{ track: LocalTrack | null }>(() => ({ track: null }));
export const editTags = (track: LocalTrack): void => {
  useTagEditor.setState({ track });
};

const num = (s: string): number | null => {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** The editor, mounted once (as an overlay) and opened from a song's menu. */
export function TagEditorHost() {
  const track = useTagEditor((s) => s.track);
  const close = (): void => {
    useTagEditor.setState({ track: null });
  };
  // Keyed by song, so every song starts from its own values.
  return track ? <Editor key={track.id} track={track} onClose={close} /> : null;
}

function Editor({ track, onClose }: { track: LocalTrack; onClose: () => void }) {
  const t = useT();
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album ?? '');
  const [albumArtist, setAlbumArtist] = useState(track.albumArtist ?? '');
  const [trackNo, setTrackNo] = useState(track.trackNo?.toString() ?? '');
  const [discNo, setDiscNo] = useState(track.discNo?.toString() ?? '');
  const [year, setYear] = useState(track.year?.toString() ?? '');
  const [genre, setGenre] = useState(track.genre ?? '');
  const [lyrics, setLyrics] = useState(track.lyrics ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const written = await invoke<ScannedTrack>('local_write_tags', {
        path: track.path,
        edit: {
          title,
          artist,
          album: album || null,
          albumArtist: albumArtist || null,
          trackNo: num(trackNo),
          discNo: num(discNo),
          year: num(year),
          genre: genre || null,
          lyrics: lyrics || null,
        },
      });
      await upsertTracks([written]);
      void queryClient.invalidateQueries({ queryKey: ['local'] });
      // Lyrics shown for this song came from the old tags.
      void queryClient.invalidateQueries({ queryKey: ['lyrics'] });
      // Some tag formats (WAV) cannot hold lyrics: say so, rather than let them vanish quietly.
      toast(lyrics.trim() && !written.lyrics ? t('local.edit.noLyrics') : t('local.edit.saved'));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    props: { inputMode?: 'numeric' } = {},
  ) => (
    <label className="flex flex-col gap-1 text-xs text-fg-muted">
      {label}
      <input
        className={inputClass}
        value={value}
        onChange={(e) => {
          set(e.target.value);
        }}
        {...props}
      />
    </label>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      title={t('local.edit.title')}
      description={t('local.edit.warning')}
      className="max-h-[90vh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto"
      closeLabel={t('common.cancel')}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {field(t('local.edit.songTitle'), title, setTitle)}
        {field(t('local.edit.artist'), artist, setArtist)}
        <div className="grid grid-cols-2 gap-3">
          {field(t('local.edit.album'), album, setAlbum)}
          {field(t('local.edit.albumArtist'), albumArtist, setAlbumArtist)}
        </div>
        <div className="grid grid-cols-4 gap-3">
          {field(t('local.edit.track'), trackNo, setTrackNo, { inputMode: 'numeric' })}
          {field(t('local.edit.disc'), discNo, setDiscNo, { inputMode: 'numeric' })}
          {field(t('local.edit.year'), year, setYear, { inputMode: 'numeric' })}
          {field(t('local.edit.genre'), genre, setGenre)}
        </div>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          {t('local.edit.lyrics')}
          <textarea
            className="min-h-28 w-full rounded-xl border border-transparent bg-bg-overlay p-3 text-sm text-fg focus-visible:border-accent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft"
            value={lyrics}
            onChange={(e) => {
              setLyrics(e.target.value);
            }}
          />
        </label>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {t('local.edit.failed', { error })}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !title.trim()}>
            {t('local.edit.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
