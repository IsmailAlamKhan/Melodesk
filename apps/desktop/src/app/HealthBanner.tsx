import { Button } from '@melodesk/ui';
import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { usePlayerStore } from '../player/store';

/** How long the player may take to attach before the app says so and offers to reload it. */
const SLOW_START_MS = 25_000;

/**
 * Shown when the bridge or adapter detects that YouTube's web app changed under us, or when the
 * player never attached. "Reload player" loads the page again, which fixes a stuck page.
 */
export function HealthBanner() {
  const t = useT();
  const health = usePlayerStore((s) => s.health);
  const ready = usePlayerStore((s) => s.ready);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_START_MS);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [ready]);
  const stuck = !ready && slow;
  if (health.status === 'ok' && !stuck) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm"
    >
      <AlertTriangle className="size-4 shrink-0 text-warning" />
      <span>
        {stuck && health.status === 'ok'
          ? t('health.slow')
          : health.status === 'broken'
            ? t('health.broken')
            : t('health.degraded')}
      </span>
      {health.reason && <code className="text-xs text-fg-subtle">{health.reason}</code>}
      <Button
        size="sm"
        className="ms-auto"
        onClick={() => {
          setSlow(false);
          void invoke('player_reload').catch(() => undefined);
        }}
      >
        {t('health.reload')}
      </Button>
    </div>
  );
}
