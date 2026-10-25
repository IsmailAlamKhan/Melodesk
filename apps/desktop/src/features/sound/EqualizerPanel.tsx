import { EQ_BAND_HZ, EQ_MAX_DB } from '@melodesk/bridge/protocol';
import { Button, Slider, cn } from '@melodesk/ui';
import { useT } from '../../i18n/index';
import { PRESETS, matchPreset, type PresetId } from '../../audio/presets';
import { MAX_CROSSFADE_SECONDS, useAudioPrefs } from '../../audio/store';
import { usePlayerStore } from '../../player/store';

const hz = (f: number): string => (f >= 1000 ? `${String(f / 1000)} kHz` : `${String(f)} Hz`);

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-border/50 bg-bg-elevated px-4 py-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-fg-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="size-4 accent-accent"
      />
    </label>
  );
}

/** Equalizer, loudness leveling and crossfade. Used by the Settings page and by Now Playing. */
export function EqualizerPanel({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const prefs = useAudioPrefs();
  const audio = usePlayerStore((s) => s.audio);
  const preset = matchPreset(prefs.gainsDb);
  const choose = (id: PresetId): void => {
    const found = PRESETS.find((p) => p.id === id);
    if (found) prefs.update({ gainsDb: [...found.gains], eqEnabled: true });
  };
  return (
    <div className={cn('flex flex-col gap-3', compact && 'p-4')}>
      <SwitchRow
        label={t('sound.eq')}
        hint={t('sound.eq.hint')}
        checked={prefs.eqEnabled}
        onChange={(v) => {
          prefs.update({ eqEnabled: v });
        }}
      />
      <div
        role="group"
        aria-label={t('sound.presets')}
        className={cn('flex flex-wrap gap-2', !prefs.eqEnabled && 'opacity-60')}
      >
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={preset === p.id}
            onClick={() => {
              choose(p.id);
            }}
            className={cn(
              'h-8 rounded-full px-3 text-xs font-medium transition-colors',
              preset === p.id
                ? 'bg-accent-soft text-accent'
                : 'bg-bg-overlay text-fg hover:bg-accent-soft',
            )}
          >
            {t(`sound.preset.${p.id}`)}
          </button>
        ))}
      </div>
      <div
        className={cn(
          'flex flex-col gap-2 rounded-2xl border border-border/50 bg-bg-elevated p-4',
          !prefs.eqEnabled && 'opacity-60',
        )}
      >
        <BandRow
          label={t('sound.preamp')}
          value={prefs.preampDb}
          disabled={!prefs.eqEnabled}
          onChange={(v) => {
            prefs.update({ preampDb: v });
          }}
        />
        {EQ_BAND_HZ.map((f, i) => (
          <BandRow
            key={f}
            label={hz(f)}
            value={prefs.gainsDb[i] ?? 0}
            disabled={!prefs.eqEnabled}
            onChange={(v) => {
              const gains = [...prefs.gainsDb];
              gains[i] = v;
              prefs.update({ gainsDb: gains });
            }}
          />
        ))}
        <Button
          variant="ghost"
          className="self-start"
          disabled={!prefs.eqEnabled}
          onClick={() => {
            choose('flat');
          }}
        >
          {t('sound.reset')}
        </Button>
      </div>
      <SwitchRow
        label={t('sound.normalize')}
        hint={t('sound.normalize.hint')}
        checked={prefs.normalize}
        onChange={(v) => {
          prefs.update({ normalize: v });
        }}
      />
      <div className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-bg-elevated px-4 py-3">
        <div className="flex items-center justify-between text-sm font-medium">
          <span id="crossfade-label">{t('sound.crossfade')}</span>
          <span className="text-xs tabular-nums text-fg-muted">
            {prefs.crossfadeSeconds === 0
              ? t('sound.crossfade.off')
              : t('sound.crossfade.seconds', { seconds: prefs.crossfadeSeconds })}
          </span>
        </div>
        <Slider
          label={t('sound.crossfade')}
          value={prefs.crossfadeSeconds}
          max={MAX_CROSSFADE_SECONDS}
          step={1}
          valueLabel={(v) => (v === 0 ? t('sound.crossfade.off') : `${String(v)} s`)}
          onChange={(v) => {
            prefs.update({ crossfadeSeconds: v });
          }}
        />
        <span className="text-xs text-fg-muted">{t('sound.crossfade.hint')}</span>
      </div>
      <p className="text-xs text-fg-subtle">
        {audio.status === 'active' ? t('sound.youtube.active') : t('sound.youtube.local')}
      </p>
    </div>
  );
}

function BandRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-xs">
      <span className="text-fg-muted">{label}</span>
      <Slider
        label={label}
        value={value + EQ_MAX_DB}
        max={EQ_MAX_DB * 2}
        step={0.5}
        disabled={disabled}
        valueLabel={(v) => `${v - EQ_MAX_DB > 0 ? '+' : ''}${String(v - EQ_MAX_DB)} dB`}
        onChange={(v) => {
          onChange(v - EQ_MAX_DB);
        }}
      />
      <span className="text-end tabular-nums text-fg-subtle">
        {value > 0 ? '+' : ''}
        {value.toFixed(1)} dB
      </span>
    </div>
  );
}

export function SoundSection() {
  const t = useT();
  return (
    <section className="flex flex-col gap-3" aria-labelledby="sound-title">
      <h2 id="sound-title" className="font-semibold">
        {t('sound.title')}
      </h2>
      <EqualizerPanel />
    </section>
  );
}
