import { AlertTriangle } from 'lucide-react';
import { usePlayerStore } from '../player/store';

/** Shown when the bridge or adapter detects that YouTube's web app changed under us. */
export function HealthBanner() {
  const health = usePlayerStore((s) => s.health);
  if (health.status === 'ok') return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm"
    >
      <AlertTriangle className="size-4 shrink-0 text-warning" />
      <span>
        {health.status === 'broken'
          ? 'Melodesk can’t control YouTube Music right now. An app update is probably needed.'
          : 'Some controls may not work. An app update is probably needed.'}
      </span>
      {health.reason && <code className="ml-auto text-xs text-fg-subtle">{health.reason}</code>}
    </div>
  );
}
