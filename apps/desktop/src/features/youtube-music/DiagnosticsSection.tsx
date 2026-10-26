import { Button } from '@melodesk/ui';
import { getVersion } from '@tauri-apps/api/app';
import { useEffect, useState } from 'react';
import { toast } from '../../app/toast';
import { useT } from '../../i18n/index';
import { usePlayerStore } from '../../player/store';

export function DiagnosticsSection() {
  const t = useT();
  const bridgeVersion = usePlayerStore((s) => s.bridgeVersion);
  const health = usePlayerStore((s) => s.health);
  const capabilities = usePlayerStore((s) => s.capabilities);
  const [version, setVersion] = useState('');
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(''));
  }, []);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{t('settings.diagnostics')}</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 rounded-2xl border border-border/50 bg-bg-elevated p-4 text-sm">
        <dt className="text-fg-subtle">{t('diag.bridge')}</dt>
        <dd>{bridgeVersion ?? '—'}</dd>
        <dt className="text-fg-subtle">{t('diag.health')}</dt>
        <dd>
          {health.status}
          {health.reason ? ` (${health.reason})` : ''}
        </dd>
        <dt className="text-fg-subtle">{t('diag.pageApis')}</dt>
        <dd className="text-xs text-fg-muted">
          {Object.entries(capabilities)
            .map(([k, v]) => `${k}:${v ? '✓' : '✗'}`)
            .join('  ')}
        </dd>
      </dl>
      <Button
        variant="ghost"
        onClick={() => {
          void navigator.clipboard.writeText(
            JSON.stringify({ version, bridgeVersion, health, capabilities }, null, 2),
          );
          toast(t('diag.copied'));
        }}
      >
        {t('diag.copy')}
      </Button>
    </section>
  );
}
