import { Button } from '@melodesk/ui';
import { useState } from 'react';
import { useT } from '../../i18n/index';
import { useSync } from './controller';

/** After settings arrive from another computer: the running app still has the old ones in memory. */
export function ReloadBanner() {
  const t = useT();
  const needsReload = useSync((s) => s.needsReload);
  const [later, setLater] = useState(false);
  if (!needsReload || later) return null;
  return (
    <div
      role="status"
      className="fixed end-4 bottom-24 z-40 flex max-w-sm flex-col gap-2 rounded-2xl border border-border/60 bg-bg-elevated p-4 shadow-xl"
    >
      <p className="text-sm">{t('sync.reload.body')}</p>
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            setLater(true);
          }}
        >
          {t('sync.reload.later')}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            window.location.reload();
          }}
        >
          {t('sync.reload.now')}
        </Button>
      </div>
    </div>
  );
}
