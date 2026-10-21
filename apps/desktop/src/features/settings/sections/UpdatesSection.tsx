import { Button } from '@melodesk/ui';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { useEffect, useState } from 'react';
import { useT } from '../../../i18n/index';

export function UpdatesSection() {
  const t = useT();
  const [version, setVersion] = useState('');
  const [updateState, setUpdateState] = useState<
    'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error'
  >('idle');
  const [updateInfo, setUpdateInfo] = useState<string | null>(null);
  useEffect(() => {
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(''));
  }, []);

  const checkForUpdates = async (): Promise<void> => {
    setUpdateState('checking');
    try {
      const u = await check();
      if (!u) {
        setUpdateState('none');
        return;
      }
      setUpdateInfo(`${u.version}${u.body ? ` — ${u.body.slice(0, 200)}` : ''}`);
      setUpdateState('downloading');
      await u.downloadAndInstall();
      setUpdateState('ready');
    } catch (err) {
      setUpdateInfo(String(err));
      setUpdateState('error');
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{t('settings.updates')}</h2>
      <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-bg-elevated p-4 text-sm">
        <div className="flex-1">
          <div>{t('settings.version', { version: version || '—' })}</div>
          <div className="text-xs text-fg-muted">
            {updateState === 'none' && t('update.upToDate')}
            {updateState === 'checking' && t('update.checking')}
            {updateState === 'downloading' && t('update.downloading', { info: updateInfo ?? '' })}
            {updateState === 'ready' && t('update.ready')}
            {updateState === 'error' && (updateInfo ?? t('update.failed'))}
            {updateState === 'idle' && t('update.idle')}
          </div>
        </div>
        {updateState === 'ready' ? (
          <Button variant="primary" onClick={() => void relaunch()}>
            {t('update.restart')}
          </Button>
        ) : (
          <Button
            disabled={updateState === 'checking' || updateState === 'downloading'}
            onClick={() => void checkForUpdates()}
          >
            {t('update.check')}
          </Button>
        )}
      </div>
    </section>
  );
}
