import * as Popover from '@radix-ui/react-popover';
import { IconButton, cn } from '@melodesk/ui';
import { Languages, SlidersHorizontal, Timer, Type } from 'lucide-react';
import { useLyricsPrefs } from '../lyrics/prefs';
import { LANGUAGES, type Provider } from '../lyrics/translate';
import type { Caveat } from '../lyrics/transliterate';
import { openDialog } from './dialogs/store';

const panel = 'z-50 w-80 rounded-lg border border-border bg-bg-elevated p-4 text-sm shadow-xl';
const select = 'h-8 w-full rounded-md border border-border bg-bg px-2 text-sm';

export interface LyricsToolbarProps {
  hasTimedLines: boolean;
  offsetMs: number;
  onOffset: (ms: number) => void;
  caveat: Caveat;
}

/** Romanize / translate toggles, translation settings, and per-song sync offset. */
export function LyricsToolbar({ hasTimedLines, offsetMs, onOffset, caveat }: LyricsToolbarProps) {
  const p = useLyricsPrefs();
  const toggleTranslate = (): void => {
    if (p.translate) {
      p.update({ translate: false });
      return;
    }
    if (p.provider === 'mymemory' && !p.translationConsent) {
      openDialog({
        type: 'confirm',
        title: 'Translate lyrics?',
        body: 'The lyric text is sent to MyMemory (api.mymemory.translated.net) to be translated. Nothing else is sent, and each song is requested once, then kept on this computer. For full privacy, use a LibreTranslate server running on this computer instead (see translation settings).',
        confirmLabel: 'Translate',
        onConfirm: () => {
          p.update({ translationConsent: true, translate: true });
        },
      });
      return;
    }
    p.update({ translate: true });
  };
  const step = (delta: number): void =>
    onOffset(Math.max(-10_000, Math.min(10_000, offsetMs + delta)));
  return (
    <div className="flex items-center gap-1" role="toolbar" aria-label="Lyrics options">
      <IconButton
        label={p.romanize ? 'Hide romanization' : 'Show romanization'}
        size="sm"
        aria-pressed={p.romanize}
        className={cn(p.romanize && 'text-accent')}
        onClick={() => p.update({ romanize: !p.romanize })}
      >
        <Type />
      </IconButton>
      <IconButton
        label={p.translate ? 'Hide translation' : 'Translate lyrics'}
        size="sm"
        aria-pressed={p.translate}
        className={cn(p.translate && 'text-accent')}
        onClick={toggleTranslate}
      >
        <Languages />
      </IconButton>

      <Popover.Root>
        <Popover.Trigger asChild>
          <IconButton label="Translation settings" size="sm">
            <SlidersHorizontal />
          </IconButton>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="end" className={panel}>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                Translate into
                <select
                  className={select}
                  value={p.target}
                  onChange={(e) => p.update({ target: e.target.value })}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                Song language
                <select
                  className={select}
                  value={p.source}
                  onChange={(e) => p.update({ source: e.target.value })}
                >
                  <option value="auto">Detect automatically</option>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-fg-subtle">
                  Romanized lyrics (like Hindi written in English letters) can’t be detected; pick
                  the language here.
                </span>
              </label>
              <label className="flex flex-col gap-1">
                Translation service
                <select
                  className={select}
                  value={p.provider}
                  onChange={(e) => p.update({ provider: e.target.value as Provider })}
                >
                  <option value="mymemory">MyMemory (free, online)</option>
                  <option value="libretranslate">LibreTranslate on this computer</option>
                </select>
              </label>
              {p.provider === 'libretranslate' && (
                <>
                  <label className="flex flex-col gap-1">
                    Server address
                    <input
                      className={select}
                      value={p.libreUrl}
                      onChange={(e) => p.update({ libreUrl: e.target.value })}
                      placeholder="http://localhost:5000"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    API key (optional)
                    <input
                      className={select}
                      type="password"
                      autoComplete="off"
                      value={p.libreKey}
                      onChange={(e) => p.update({ libreKey: e.target.value })}
                    />
                  </label>
                </>
              )}
              <p className="text-xs text-fg-subtle">
                {p.provider === 'mymemory'
                  ? 'Sends lyric text to api.mymemory.translated.net. Free daily limit applies.'
                  : 'Nothing leaves this computer. Only localhost addresses are allowed.'}
              </p>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Popover.Root>
        <Popover.Trigger asChild>
          <IconButton
            label="Lyrics timing"
            size="sm"
            disabled={!hasTimedLines}
            className={cn(offsetMs !== 0 && 'text-accent')}
          >
            <Timer />
          </IconButton>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="end" className={panel}>
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">Sync offset</span>
                <span className="tabular-nums text-fg-muted">{`${offsetMs > 0 ? '+' : ''}${(offsetMs / 1000).toFixed(1)} s`}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-8 flex-1 rounded-md bg-bg-overlay hover:bg-border"
                  onClick={() => step(-500)}
                >
                  Earlier −0.5 s
                </button>
                <button
                  type="button"
                  className="h-8 flex-1 rounded-md bg-bg-overlay hover:bg-border"
                  onClick={() => step(500)}
                >
                  Later +0.5 s
                </button>
              </div>
              <button
                type="button"
                className="h-8 rounded-md text-fg-muted hover:bg-bg-overlay"
                disabled={offsetMs === 0}
                onClick={() => onOffset(0)}
              >
                Reset
              </button>
              <p className="text-xs text-fg-subtle">
                If lines appear too soon, press Later; if they lag, press Earlier. Remembered for
                this song.
              </p>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {caveat && (
        <span
          className="ml-1 text-[11px] text-fg-subtle"
          title={
            caveat === 'kanji'
              ? 'Chinese characters and Japanese kanji are read as Mandarin offline, so romanization may be wrong.'
              : 'Arabic and Hebrew are written without vowels, so romanization is approximate.'
          }
        >
          approximate
        </span>
      )}
    </div>
  );
}
