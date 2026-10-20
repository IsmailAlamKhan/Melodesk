import { Button, inputClass } from '@melodesk/ui';
import { usePluginHost, type PluginRecord } from '../../plugins/host';

const PERMISSION_LABELS: Record<string, string> = {
  'playback:read': 'reads what is playing',
  'playback:control': 'controls playback',
  'network:fetch': 'network',
  'storage:plugin': 'stores its own data',
  notifications: 'notifications',
  'native:discord': 'Discord',
};

export function PluginsSection() {
  const plugins = usePluginHost((s) => s.plugins);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Plugins</h2>
      <p className="text-sm text-fg-muted">
        All plugins are off by default. Each one lists exactly what it can reach; integrations that
        send data say what they send.
      </p>
      {plugins.map((p) => (
        <PluginCard key={p.manifest.id} plugin={p} />
      ))}
    </section>
  );
}

function PluginCard({ plugin: p }: { plugin: PluginRecord }) {
  const setEnabled = usePluginHost((s) => s.setEnabled);
  const setSettings = usePluginHost((s) => s.setSettings);
  const fields = p.def.settingsFields ?? [];
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium">{p.manifest.name}</div>
          <div className="text-xs text-fg-muted">{p.manifest.description}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {p.manifest.permissions.map((perm) => (
              <span
                key={perm}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] text-fg-subtle"
              >
                {PERMISSION_LABELS[perm] ?? perm}
                {perm === 'network:fetch' ? `: ${p.manifest.hosts.join(', ')}` : ''}
              </span>
            ))}
          </div>
        </div>
        <input
          type="checkbox"
          role="switch"
          aria-label={`Enable ${p.manifest.name}`}
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
                {f.label}
                {f.hint && <span className="block text-xs text-fg-subtle">{f.hint}</span>}
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
