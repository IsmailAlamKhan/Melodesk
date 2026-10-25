import { Button, Dialog } from '@melodesk/ui';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { Download, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from '../../app/toast';
import { db } from '../../data/persister';
import { useT } from '../../i18n/index';
import { collectBackup, parseBackup, restoreBackup, type BackupFile } from './backup';

const MAX_BYTES = 200 * 1024 * 1024;

/** Back up and restore settings (and, if asked, listening history) as a file the user keeps. */
export function BackupSection() {
  const t = useT();
  const [history, setHistory] = useState(true);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [replaceHistory, setReplaceHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const back = async (): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      const day = new Date().toISOString().slice(0, 10);
      const path = await save({
        defaultPath: `melodesk-backup-${day}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;
      const file = await collectBackup(await db(), history);
      await writeTextFile(path, JSON.stringify(file, null, 2));
      toast(t('backup.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const choose = async (): Promise<void> => {
    setError(null);
    const picked = await open({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (typeof picked !== 'string') return;
    try {
      const text = await readTextFile(picked);
      if (text.length > MAX_BYTES) throw new Error(t('backup.tooBig'));
      const parsed = parseBackup(text);
      if (!parsed.ok) throw new Error(t('backup.notBackup'));
      setReplaceHistory(true);
      setPending(parsed.file);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const restore = async (file: BackupFile): Promise<void> => {
    setBusy(true);
    try {
      await restoreBackup(await db(), file, replaceHistory);
      toast(t('backup.restored'));
      // Everything reads its settings at start-up: begin again with the restored ones.
      window.setTimeout(() => {
        window.location.reload();
      }, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="backup-title">
      <h2 id="backup-title" className="font-semibold">
        {t('backup.title')}
      </h2>
      <p className="text-sm text-fg-muted">{t('backup.body')}</p>
      <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-bg-elevated p-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={history}
            onChange={(e) => {
              setHistory(e.target.checked);
            }}
            className="size-4 accent-accent"
          />
          {t('backup.includeHistory')}
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => void back()}>
            <Download className="size-4" />
            {t('backup.backUp')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void choose()}>
            <Upload className="size-4" />
            {t('backup.restore')}
          </Button>
        </div>
        <p className="text-xs text-fg-subtle">{t('backup.noSecrets')}</p>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {t('backup.failed', { error })}
          </p>
        )}
      </div>
      {pending && (
        <Dialog
          open
          onOpenChange={(o) => {
            if (!o && !busy) setPending(null);
          }}
          title={t('backup.confirm.title')}
          description={t('backup.confirm.body', {
            settings: Object.keys(pending.settings).length,
            date: pending.exportedAt ? pending.exportedAt.slice(0, 10) : '?',
          })}
          closeLabel={t('common.cancel')}
        >
          {pending.history && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={replaceHistory}
                onChange={(e) => {
                  setReplaceHistory(e.target.checked);
                }}
                className="size-4 accent-accent"
              />
              {t('backup.confirm.history', { count: pending.history.length })}
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPending(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void restore(pending)}>
              {t('backup.confirm.restore')}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
