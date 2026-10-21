import { WifiOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useT } from '../i18n';

const subscribe = (onChange: () => void): (() => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

/** Says so when the computer has no network, and what still works. */
export function OfflineBanner() {
  const t = useT();
  const online = useSyncExternalStore(subscribe, () => navigator.onLine);
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-border bg-bg-elevated px-4 py-2 text-sm text-fg-muted"
    >
      <WifiOff className="size-4 shrink-0" />
      <span>{t('offline.banner')}</span>
    </div>
  );
}
