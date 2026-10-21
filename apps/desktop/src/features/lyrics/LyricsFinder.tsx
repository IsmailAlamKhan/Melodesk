import { Button } from '@melodesk/ui';
import { Search } from 'lucide-react';
import { useState } from 'react';
import type { LyricsOverride } from '../../data/lyricsOverride';
import { useT } from '../../i18n/index';
import { usePlayerStore } from '../../player/store';

const input =
  'h-9 w-full rounded-md border border-border bg-bg-elevated px-3 text-sm text-fg outline-none focus:border-accent';

/**
 * "Which song is this?": for covers and uploads whose title says little, the listener types the
 * real song and artist and the lyrics are looked up for that instead. Remembered for the track.
 */
export function LyricsFinder({
  override,
  onSave,
  startOpen = false,
}: {
  override: LyricsOverride | null;
  onSave: (value: LyricsOverride | null) => void;
  startOpen?: boolean;
}) {
  const t = useT();
  const track = usePlayerStore((s) => s.track);
  const [open, setOpen] = useState(startOpen);
  const [title, setTitle] = useState(override?.title ?? '');
  const [artist, setArtist] = useState(override?.artist ?? '');
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 self-start text-xs text-fg-subtle hover:text-fg hover:underline"
      >
        <Search className="size-3.5" />
        {override ? t('lyrics.finder.change') : t('lyrics.finder.wrong')}
      </button>
    );
  return (
    <form
      className="flex flex-col gap-2 rounded-md bg-bg-overlay px-3 py-3 text-xs text-fg-muted"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) onSave({ title: title.trim(), artist: artist.trim() });
      }}
    >
      <div>{t('lyrics.finder.hint')}</div>
      <label className="flex flex-col gap-1">
        {t('lyrics.finder.title')}
        <input
          className={input}
          value={title}
          placeholder={track?.title ?? ''}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1">
        {t('lyrics.finder.artist')}
        <input
          className={input}
          value={artist}
          placeholder={t('lyrics.finder.artistHint')}
          onChange={(e) => setArtist(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={!title.trim()}>
          {t('lyrics.finder.search')}
        </Button>
        {override && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onSave(null);
              setTitle('');
              setArtist('');
            }}
          >
            {t('lyrics.finder.reset')}
          </Button>
        )}
      </div>
    </form>
  );
}
