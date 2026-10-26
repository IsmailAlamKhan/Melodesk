import { Button } from '@melodesk/ui';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderSync, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n/index';
import { chooseFolder, stopSyncing, syncNow, useSync } from './controller';

/** Keep settings the same on several computers, through a folder that something else already syncs. */
export function SyncSection() {
  const t = useT();
  const { folder, git, status, lastAt, error } = useSync();
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (): Promise<void> => {
    setProblem(null);
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked !== 'string') return;
    try {
      await chooseFolder(picked);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
  };

  const shownError =
    problem ??
    (error === 'not-ours' ? t('sync.notOurs') : error ? t('sync.failed', { error }) : null);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="sync-title">
      <h2 id="sync-title" className="font-semibold">
        {t('sync.title')}
      </h2>
      <p className="text-sm text-fg-muted">{t('sync.body')}</p>
      <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-bg-elevated p-4">
        {folder ? (
          <>
            <p className="text-sm">
              <span className="text-fg-muted">{t('sync.folder')} </span>
              <code className="break-all">{folder}</code>
            </p>
            <p className="text-xs text-fg-subtle" role="status">
              {status === 'syncing'
                ? t('sync.syncing')
                : lastAt
                  ? t('sync.last', { time: new Date(lastAt).toLocaleString() })
                  : t('sync.never')}
            </p>
          </>
        ) : (
          <p className="text-sm text-fg-muted">{t('sync.off')}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => void pick()}>
            <FolderSync className="size-4" />
            {folder ? t('sync.change') : t('sync.choose')}
          </Button>
          {folder && (
            <>
              <Button
                variant="ghost"
                disabled={status === 'syncing'}
                onClick={() => void syncNow()}
              >
                <RefreshCw className="size-4" />
                {t('sync.now')}
              </Button>
              <Button variant="ghost" onClick={() => void stopSyncing()}>
                {t('sync.stop')}
              </Button>
            </>
          )}
        </div>
        {git && <p className="text-xs text-fg-muted">{t('sync.git')}</p>}
        <p className="text-xs text-fg-subtle">{t('sync.what')}</p>
        <p className="text-xs text-fg-subtle">{t('sync.how')}</p>
        {shownError && (
          <p role="alert" className="text-xs text-danger">
            {shownError}
          </p>
        )}
      </div>
    </section>
  );
}
