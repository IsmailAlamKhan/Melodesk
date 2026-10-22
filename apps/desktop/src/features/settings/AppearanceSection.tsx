import { Button, Tooltip, cn } from '@melodesk/ui';
import { useMemo, useState } from 'react';
import { toast } from '../../app/toast';
import { roleColors } from '../../appearance/material';
import {
  THEME_PRESETS,
  decodeTheme,
  encodeTheme,
  isPreset,
  presetPrefs,
  type ThemePreset,
} from '../../appearance/themes';
import {
  ACCENT_PRESETS,
  oklchToRgb,
  toHex,
  presetRgb,
  type AccentPresetId,
} from '../../appearance/color';
import {
  useAppearance,
  type Density,
  type Direction,
  type ThemeMode,
} from '../../appearance/store';
import { availableLocales, localeName, useT, type MessageKey } from '../../i18n/index';

const ACCENT_KEYS: Record<AccentPresetId, MessageKey> = {
  coral: 'settings.accent.coral',
  amber: 'settings.accent.amber',
  green: 'settings.accent.green',
  blue: 'settings.accent.blue',
  purple: 'settings.accent.purple',
  pink: 'settings.accent.pink',
};

const THEMES: { id: ThemeMode; key: MessageKey }[] = [
  { id: 'system', key: 'settings.theme.system' },
  { id: 'light', key: 'settings.theme.light' },
  { id: 'dark', key: 'settings.theme.dark' },
  { id: 'amoled', key: 'settings.theme.amoled' },
];
const DENSITIES: { id: Density; key: MessageKey }[] = [
  { id: 'compact', key: 'settings.density.compact' },
  { id: 'comfortable', key: 'settings.density.comfortable' },
  { id: 'spacious', key: 'settings.density.spacious' },
];
const DIRECTIONS: { id: Direction; key: MessageKey }[] = [
  { id: 'auto', key: 'settings.direction.auto' },
  { id: 'ltr', key: 'settings.direction.ltr' },
  { id: 'rtl', key: 'settings.direction.rtl' },
];

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; text: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-1 rounded-full border border-border bg-bg-elevated p-1"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'rounded-full px-3 py-1 text-sm',
            value === o.id ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

const CONTRASTS = [
  { id: 'standard', key: 'settings.contrast.standard' },
  { id: 'medium', key: 'settings.contrast.medium' },
  { id: 'high', key: 'settings.contrast.high' },
] as const;

/** A small picture of a preset: its background, a raised card and its accent. */
function PresetSwatch({ preset }: { preset: ThemePreset }) {
  const colors = useMemo(() => roleColors(preset.accent, preset.theme), [preset]);
  return (
    <span
      aria-hidden
      className="flex h-14 w-full flex-col justify-between rounded-lg border border-border/60 p-2"
      style={{ background: colors.surface }}
    >
      <span className="h-2 w-1/2 rounded-full" style={{ background: colors.primary }} />
      <span className="flex gap-1">
        <span
          className="h-4 flex-1 rounded"
          style={{ background: colors['surface-container-high'] }}
        />
        <span
          className="h-4 w-4 rounded-full"
          style={{ background: colors['primary-container'] }}
        />
      </span>
    </span>
  );
}

function Themes() {
  const t = useT();
  const a = useAppearance();
  const [code, setCode] = useState('');
  const [invalid, setInvalid] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-fg-muted" id="themes-title">
        {t('settings.themes')}
      </span>
      <div
        role="group"
        aria-labelledby="themes-title"
        className="grid grid-cols-2 gap-2 rail:grid-cols-4"
      >
        {THEME_PRESETS.map((p) => {
          const on = isPreset(p, a);
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={on}
              onClick={() => a.update(presetPrefs(p))}
              className={cn(
                'flex flex-col gap-1.5 rounded-xl border p-1.5 text-start text-sm transition-colors',
                on ? 'border-accent bg-accent-soft' : 'border-border/50 hover:bg-bg-overlay',
              )}
            >
              <PresetSwatch preset={p} />
              <span className="px-1 pb-0.5">{t(p.name)}</span>
            </button>
          );
        })}
      </div>
      <span className="text-xs text-fg-subtle">{t('settings.themes.hint')}</span>
      <div className="mt-2 flex flex-col gap-2">
        <span className="text-xs text-fg-subtle">{t('settings.themeCode.hint')}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              void navigator.clipboard
                .writeText(encodeTheme(a))
                .then(() => toast(t('settings.themeCode.copied')))
                .catch(() => undefined);
            }}
          >
            {t('settings.themeCode.copy')}
          </Button>
          <form
            className="flex min-w-0 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const look = decodeTheme(code);
              setInvalid(look === null);
              if (look) {
                a.update(look);
                setCode('');
                toast(t('settings.themeCode.applied'));
              }
            }}
          >
            <input
              value={code}
              aria-label={t('settings.themeCode.paste')}
              placeholder={t('settings.themeCode.paste')}
              aria-invalid={invalid}
              onChange={(e) => {
                setCode(e.target.value);
                setInvalid(false);
              }}
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-bg-elevated px-3 text-sm outline-none focus:border-accent"
            />
            <Button type="submit" disabled={!code.trim()}>
              {t('settings.themeCode.apply')}
            </Button>
          </form>
        </div>
        {invalid && (
          <p role="alert" className="text-xs text-danger">
            {t('settings.themeCode.invalid')}
          </p>
        )}
      </div>
    </div>
  );
}

export function AppearanceSection() {
  const t = useT();
  const a = useAppearance();
  const customHex = a.accent.kind === 'custom' ? a.accent.hex : '#7c5cff';
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-semibold">{t('settings.appearance')}</h2>

      <Themes />

      <div className="flex flex-col gap-2">
        <span className="text-sm text-fg-muted">{t('settings.theme')}</span>
        <Segmented
          label={t('settings.theme')}
          value={a.theme}
          options={THEMES.map((x) => ({ id: x.id, text: t(x.key) }))}
          onChange={(theme) => a.update({ theme })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-fg-muted">{t('settings.contrast')}</span>
        <Segmented
          label={t('settings.contrast')}
          value={a.contrast}
          options={CONTRASTS.map((x) => ({ id: x.id, text: t(x.key) }))}
          onChange={(contrast) => a.update({ contrast })}
        />
        <span className="text-xs text-fg-subtle">{t('settings.contrast.hint')}</span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-fg-muted">{t('settings.accent')}</span>
        <div
          role="radiogroup"
          aria-label={t('settings.accent')}
          className="flex flex-wrap items-center gap-2"
        >
          {ACCENT_PRESETS.map((p) => {
            const selected = a.accent.kind === 'preset' && a.accent.id === p.id;
            return (
              <Tooltip key={p.id} label={t(ACCENT_KEYS[p.id])}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={t(ACCENT_KEYS[p.id])}
                  onClick={() => a.update({ accent: { kind: 'preset', id: p.id } })}
                  className={cn(
                    'size-8 rounded-full border-2 transition-transform hover:scale-110',
                    selected ? 'border-fg' : 'border-transparent',
                  )}
                  style={{ background: toHex(presetRgb(p.id)) }}
                />
              </Tooltip>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={a.accent.kind === 'art'}
            onClick={() => a.update({ accent: { kind: 'art' } })}
            className={cn(
              'h-8 rounded-full border px-3 text-sm',
              a.accent.kind === 'art'
                ? 'border-fg bg-fg text-bg'
                : 'border-border text-fg-muted hover:text-fg',
            )}
          >
            {t('settings.accent.art')}
          </button>
          <label
            className={cn(
              'flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm',
              a.accent.kind === 'custom' ? 'border-fg' : 'border-border text-fg-muted',
            )}
          >
            <span
              className="size-4 rounded-full border border-border"
              style={{ background: customHex }}
            />
            {t('settings.accent.custom')}
            <input
              type="color"
              value={customHex}
              onChange={(e) => a.update({ accent: { kind: 'custom', hex: e.target.value } })}
              className="sr-only"
            />
          </label>
        </div>
        <span className="text-xs text-fg-subtle">{t('settings.accent.hint')}</span>
      </div>

      <label className="flex items-start justify-between gap-4">
        <span className="flex flex-col gap-1">
          <span className="text-sm text-fg-muted">{t('settings.pageColors')}</span>
          <span className="text-xs text-fg-subtle">{t('settings.pageColors.hint')}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label={t('settings.pageColors')}
          checked={a.pageColors}
          onChange={(e) => a.update({ pageColors: e.target.checked })}
          className="mt-1 size-4 shrink-0 accent-accent"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-fg-muted">{t('settings.density')}</span>
        <Segmented
          label={t('settings.density')}
          value={a.density}
          options={DENSITIES.map((x) => ({ id: x.id, text: t(x.key) }))}
          onChange={(density) => a.update({ density })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="language" className="text-sm text-fg-muted">
          {t('settings.language')}
        </label>
        <select
          id="language"
          value={a.language}
          onChange={(e) => a.update({ language: e.target.value })}
          className="h-9 max-w-xs rounded-md border border-border bg-bg-elevated px-2 text-sm"
        >
          <option value="system">{t('settings.language.system')}</option>
          {availableLocales().map((code) => (
            <option key={code} value={code}>
              {localeName(code)}
            </option>
          ))}
        </select>
        <span className="text-xs text-fg-subtle">{t('settings.language.hint')}</span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm text-fg-muted">{t('settings.direction')}</span>
        <Segmented
          label={t('settings.direction')}
          value={a.direction}
          options={DIRECTIONS.map((x) => ({ id: x.id, text: t(x.key) }))}
          onChange={(direction) => a.update({ direction })}
        />
      </div>
    </section>
  );
}

export { oklchToRgb };
