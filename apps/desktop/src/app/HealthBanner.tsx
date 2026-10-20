import { AlertTriangle } from 'lucide-react';
import { useT } from '../i18n';
import { usePlayerStore } from '../player/store';

/** Shown when the bridge or adapter detects that YouTube's web app changed under us. */
export function HealthBanner() {
  const t = useT();
  const health = usePlayerStore((s) => s.health);
  if (health.status === 'ok') return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm"
    >
      <AlertTriangle className="size-4 shrink-0 text-warning" />
      <span>{health.status === 'broken' ? t('health.broken') : t('health.degraded')}</span>
      {health.reason && <code className="ms-auto text-xs text-fg-subtle">{health.reason}</code>}
    </div>
  );
}
