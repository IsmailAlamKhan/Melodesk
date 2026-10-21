import * as Popover from '@radix-ui/react-popover';
import { IconButton, cn } from '@melodesk/ui';
import { Languages, MicVocal, SlidersHorizontal, Timer, Type } from 'lucide-react';
import { languageName, useI18n, useT } from '../i18n';
import { useLyricsPrefs } from '../lyrics/prefs';
import { LANGUAGES, type Provider } from '../lyrics/translate';
import type { Caveat } from '../lyrics/transliterate';
import { openDialog } from './dialogs/store';
import { useUiStore } from './uiStore';

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
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const p = useLyricsPrefs();
  const karaokeOpen = useUiStore((s) => s.karaokeOpen);
  const openKaraoke = useUiStore((s) => s.setKaraokeOpen);
  const toggleTranslate = (): void => {
    if (p.translate) {
      p.update({ translate: false });
      return;
    }
    if (p.provider === 'mymemory' && !p.translationConsent) {
      openDialog({
        type: 'confirm',
        title: t('lyrics.consent.title'),
        body: t('lyrics.consent.body'),
        confirmLabel: t('lyrics.consent.confirm'),
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
    <div className="flex items-center gap-1" role="toolbar" aria-label={t('lyrics.opt.label')}>
      <IconButton
        label={p.romanize ? t('lyrics.opt.hideRoman') : t('lyrics.opt.showRoman')}
        size="sm"
        aria-pressed={p.romanize}
        className={cn(p.romanize && 'text-accent')}
        onClick={() => p.update({ romanize: !p.romanize })}
      >
        <Type />
      </IconButton>
      <IconButton
        label={p.translate ? t('lyrics.opt.hideTrans') : t('lyrics.opt.translate')}
        size="sm"
        aria-pressed={p.translate}
        className={cn(p.translate && 'text-accent')}
        onClick={toggleTranslate}
      >
        <Languages />
      </IconButton>

      {!karaokeOpen && (
        <IconButton label={t('karaoke.open')} size="sm" onClick={() => openKaraoke(true)}>
          <MicVocal />
        </IconButton>
      )}

      <Popover.Root>
        <Popover.Trigger asChild>
          <IconButton label={t('lyrics.opt.settings')} size="sm">
            <SlidersHorizontal />
          </IconButton>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="end" className={panel}>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                {t('lyrics.translateInto')}
                <select
                  className={select}
                  value={p.target}
                  onChange={(e) => p.update({ target: e.target.value })}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {languageName(l.code, locale)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                {t('lyrics.songLanguage')}
                <select
                  className={select}
                  value={p.source}
                  onChange={(e) => p.update({ source: e.target.value })}
                >
                  <option value="auto">{t('lyrics.detectAuto')}</option>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {languageName(l.code, locale)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-fg-subtle">{t('lyrics.songLanguageHint')}</span>
              </label>
              <label className="flex flex-col gap-1">
                {t('lyrics.service')}
                <select
                  className={select}
                  value={p.provider}
                  onChange={(e) => p.update({ provider: e.target.value as Provider })}
                >
                  <option value="mymemory">{t('lyrics.service.mymemory')}</option>
                  <option value="libretranslate">{t('lyrics.service.libre')}</option>
                </select>
              </label>
              {p.provider === 'libretranslate' && (
                <>
                  <label className="flex flex-col gap-1">
                    {t('lyrics.serverAddress')}
                    <input
                      className={select}
                      value={p.libreUrl}
                      onChange={(e) => p.update({ libreUrl: e.target.value })}
                      placeholder="http://localhost:5000"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    {t('lyrics.apiKeyOptional')}
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
                  ? t('lyrics.serviceHint.mymemory')
                  : t('lyrics.serviceHint.libre')}
              </p>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Popover.Root>
        <Popover.Trigger asChild>
          <IconButton
            label={t('lyrics.timing')}
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
                <span className="font-medium">{t('lyrics.syncOffset')}</span>
                <span className="tabular-nums text-fg-muted">
                  {t('lyrics.offsetValue', {
                    sign: offsetMs > 0 ? '+' : '',
                    seconds: (offsetMs / 1000).toFixed(1),
                  })}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-8 flex-1 rounded-md bg-bg-overlay hover:bg-border"
                  onClick={() => step(-500)}
                >
                  {t('lyrics.earlier')}
                </button>
                <button
                  type="button"
                  className="h-8 flex-1 rounded-md bg-bg-overlay hover:bg-border"
                  onClick={() => step(500)}
                >
                  {t('lyrics.later')}
                </button>
              </div>
              <button
                type="button"
                className="h-8 rounded-md text-fg-muted hover:bg-bg-overlay"
                disabled={offsetMs === 0}
                onClick={() => onOffset(0)}
              >
                {t('lyrics.reset')}
              </button>
              <p className="text-xs text-fg-subtle">{t('lyrics.timingHint')}</p>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {caveat && (
        <span
          className="ms-1 text-[11px] text-fg-subtle"
          title={caveat === 'kanji' ? t('lyrics.caveat.kanji') : t('lyrics.caveat.abjad')}
        >
          {t('lyrics.approximate')}
        </span>
      )}
    </div>
  );
}
