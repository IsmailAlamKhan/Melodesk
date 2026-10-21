import { useT } from '../../i18n/index';
import { SHORTCUT_ACTIONS, useSettings } from '../../settings/store';
import { ShortcutField } from './ShortcutField';

export function ShortcutsSection() {
  const t = useT();
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{t('settings.shortcuts')}</h2>
      <p className="text-sm text-fg-muted">{t('settings.shortcutsHint')}</p>
      {settings && (
        <div className="flex flex-col divide-y divide-border rounded-2xl border border-border/50 bg-bg-elevated">
          {SHORTCUT_ACTIONS.map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
              <span>{t(a.labelKey)}</span>
              <ShortcutField
                value={settings.shortcuts[a.key]}
                onChange={(v) => void update({ shortcuts: { ...settings.shortcuts, [a.key]: v } })}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
