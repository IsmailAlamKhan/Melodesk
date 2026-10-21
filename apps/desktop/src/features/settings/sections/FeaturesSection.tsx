import { dependentsOf, useFeatures } from '../../../core';
import { useT } from '../../../i18n/index';
import { Toggle } from './Toggle';

/** Every optional feature with a switch, so parts of the app can be turned off (or back on). */
export function FeaturesSection() {
  const t = useT();
  const features = useFeatures((s) => s.features);
  const active = useFeatures((s) => s.active);
  const native = useFeatures((s) => s.native);
  const setEnabled = useFeatures((s) => s.setEnabled);
  const isOn = (id: string): boolean => active.some((f) => f.id === id);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="features-title">
      <h2 id="features-title" className="font-semibold">
        {t('settings.features')}
      </h2>
      <p className="text-sm text-fg-muted">{t('settings.featuresHint')}</p>
      {features
        .filter((f) => f.core !== true)
        .map((f) => {
          const missing = (f.requires ?? []).some((r) => native !== null && !native.has(r));
          const on = isOn(f.id);
          const dependents = on ? dependentsOf(f.id, features).filter((d) => isOn(d.id)) : [];
          const notes = [
            t(f.description),
            missing && t('features.unavailable'),
            on &&
              (f.dependsOn ?? []).length > 0 &&
              t('features.needs', {
                names: (f.dependsOn ?? [])
                  .map((d) => features.find((x) => x.id === d))
                  .map((d) => (d ? t(d.name) : ''))
                  .join(', '),
              }),
            dependents.length > 0 &&
              t('features.dependents', { names: dependents.map((d) => t(d.name)).join(', ') }),
          ].filter((x): x is string => typeof x === 'string');
          return (
            <Toggle
              key={f.id}
              label={t(f.name)}
              hint={notes.join(' ')}
              checked={on}
              disabled={missing}
              onChange={(v) => setEnabled(f.id, v)}
            />
          );
        })}
    </section>
  );
}
