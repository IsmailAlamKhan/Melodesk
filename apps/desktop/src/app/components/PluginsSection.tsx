import { Button, inputClass } from '@melodesk/ui';
import { useT, useTDynamic, type MessageKey } from '../../i18n';
import { usePluginHost, type PluginRecord } from '../../plugins/host';

const PERMISSION_KEYS: Record<string, MessageKey> = {
  'playback:read': 'plugin.perm.playbackRead',
  'playback:control': 'plugin.perm.playbackControl',
  'network:fetch': 'plugin.perm.network',
  'storage:plugin': 'plugin.perm.storage',
  notifications: 'plugin.perm.notifications',
  'open:link': 'plugin.perm.openLink',
  'native:discord': 'plugin.perm.discord',
};

export function PluginsSection() {
  const t = useT();
  const plugins = usePluginHost((s) => s.plugins);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="section-title font-semibold">{t('plugins.title')}</h2>
      <p className="text-sm text-fg-muted">{t('plugins.intro')}</p>
      {plugins.map((p) => (
        <PluginCard key={p.manifest.id} plugin={p} />
      ))}
    </section>
  );
}

function PluginCard({ plugin: p }: { plugin: PluginRecord }) {
  const setEnabled = usePluginHost((s) => s.setEnabled);
  const setSettings = usePluginHost((s) => s.setSettings);
  const t = useT();
  const td = useTDynamic();
  const id = p.manifest.id;
  const fields = p.def.settingsFields ?? [];
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium">{td(`plugin.${id}.name`, p.manifest.name)}</div>
          <div className="text-xs text-fg-muted">
            {td(`plugin.${id}.description`, p.manifest.description)}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {p.manifest.permissions.map((perm) => (
              <span
                key={perm}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-subtle"
              >
                {PERMISSION_KEYS[perm] ? t(PERMISSION_KEYS[perm]) : perm}
                {perm === 'network:fetch' ? `: ${p.manifest.hosts.join(', ')}` : ''}
                {perm === 'open:link' ? `: ${p.manifest.linkHosts.join(', ')}` : ''}
              </span>
            ))}
          </div>
        </div>
        <input
          type="checkbox"
          role="switch"
          aria-label={t('plugins.enable', { name: td(`plugin.${id}.name`, p.manifest.name) })}
          aria-checked={p.enabled}
          checked={p.enabled}
          onChange={(e) => void setEnabled(p.manifest.id, e.target.checked)}
          className="mt-1 size-4 accent-accent"
        />
      </div>
      {p.enabled && fields.length > 0 && (
        <div className="flex flex-col gap-2">
          {fields.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {td(`plugin.${id}.field.${f.key}.label`, f.label)}
                {f.hint && (
                  <span className="block text-xs text-fg-subtle">
                    {td(`plugin.${id}.field.${f.key}.hint`, f.hint)}
                  </span>
                )}
              </span>
              {f.type === 'boolean' ? (
                <input
                  type="checkbox"
                  checked={p.settings[f.key] === true}
                  onChange={(e) =>
                    void setSettings(p.manifest.id, { ...p.settings, [f.key]: e.target.checked })
                  }
                  className="size-4 accent-accent"
                />
              ) : f.type === 'select' ? (
                <select
                  value={String(p.settings[f.key] ?? '')}
                  onChange={(e) =>
                    void setSettings(p.manifest.id, { ...p.settings, [f.key]: e.target.value })
                  }
                  className="rounded-md border border-border bg-bg px-2 py-1 text-sm"
                >
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={
                    f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'
                  }
                  value={String(p.settings[f.key] ?? '')}
                  autoComplete="off"
                  onChange={(e) =>
                    void setSettings(p.manifest.id, {
                      ...p.settings,
                      [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value,
                    })
                  }
                  className={`${inputClass} max-w-64`}
                />
              )}
            </label>
          ))}
        </div>
      )}
      {p.enabled && (p.instance?.actions?.length ?? 0) > 0 && (
        <div className="flex gap-2">
          {p.instance?.actions?.map((a) => (
            <Button
              key={a.label}
              size="sm"
              onClick={() => void a.run().then(() => usePluginHost.getState().refreshStatus())}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
      {p.enabled && (p.status ?? p.error) && (
        <div className={`text-xs ${p.error ? 'text-danger' : 'text-fg-subtle'}`}>
          {p.error ?? p.status}
        </div>
      )}
    </div>
  );
}
