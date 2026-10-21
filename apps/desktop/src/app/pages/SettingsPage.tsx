import { Button } from '@melodesk/ui';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useEffect, useState } from 'react';
import { useAccount } from '../../data/hooks';
import { useT } from '../../i18n';
import { sendCommand, setPlayerVisible } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { SHORTCUT_ACTIONS, useSettings } from '../../settings/store';
import { ShortcutField } from '../components/ShortcutField';
import { PluginsSection } from '../components/PluginsSection';
import { AppearanceSection } from '../components/AppearanceSection';
import { StorageSection } from '../components/StorageSection';
import { toast } from '../toast';
import { CachedImg } from '../../artwork/CachedImg';

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl bg-surface-container px-4 py-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-fg-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-accent"
      />
    </label>
  );
}

export function SettingsPage() {
  const t = useT();
  const account = useAccount();
  const playerVisible = usePlayerStore((s) => s.playerVisible);
  const bridgeVersion = usePlayerStore((s) => s.bridgeVersion);
  const health = usePlayerStore((s) => s.health);
  const capabilities = usePlayerStore((s) => s.capabilities);
  const settings = useSettings((s) => s.settings);
  const settingsError = useSettings((s) => s.error);
  const update = useSettings((s) => s.update);
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
  const isMac = navigator.userAgent.includes('Macintosh');

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">{t('settings.title')}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('settings.account')}</h2>
        <div className="flex items-center gap-3 rounded-2xl bg-surface-container p-4">
          {account.data?.avatarUrl && (
            <CachedImg src={account.data.avatarUrl} alt="" className="size-10 rounded-full" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              {account.data?.signedIn ? account.data.name : t('settings.notSignedIn')}
            </div>
            <div className="truncate text-xs text-fg-muted">
              {account.data?.handle ?? t('settings.signInHint')}
            </div>
          </div>
          {account.data?.signedIn ? (
            <>
              <Button onClick={() => void setPlayerVisible(true)}>
                {t('settings.switchAccount')}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  void sendCommand({
                    type: 'endpoint',
                    endpoint: { signOutEndpoint: { hack: true } },
                    mode: 'navigate',
                  })
                }
              >
                {t('settings.signOut')}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => void setPlayerVisible(true)}>
              {t('settings.signIn')}
            </Button>
          )}
        </div>
      </section>

      <AppearanceSection />

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('settings.desktop')}</h2>
        {settings && (
          <>
            <Toggle
              label={t('settings.closeToTray')}
              hint={isMac ? t('settings.closeToTrayHintMac') : t('settings.closeToTrayHint')}
              checked={settings.closeToTray}
              onChange={(v) => void update({ closeToTray: v })}
            />
            <Toggle
              label={t('settings.launchAtLogin')}
              checked={settings.launchAtLogin}
              onChange={(v) => void update({ launchAtLogin: v })}
            />
            <Toggle
              label={t('settings.notify')}
              hint={t('settings.notifyHint')}
              checked={settings.notifyOnTrackChange}
              onChange={(v) => void update({ notifyOnTrackChange: v })}
            />
          </>
        )}
        {settingsError && (
          <p role="alert" className="text-xs text-danger">
            {settingsError}
          </p>
        )}
        <div>
          <Button onClick={() => void setPlayerVisible(!playerVisible)}>
            {playerVisible ? t('settings.hidePlayer') : t('settings.showPlayer')}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('settings.shortcuts')}</h2>
        <p className="text-sm text-fg-muted">{t('settings.shortcutsHint')}</p>
        {settings && (
          <div className="flex flex-col divide-y divide-border rounded-2xl bg-surface-container">
            {SHORTCUT_ACTIONS.map((a) => (
              <div
                key={a.key}
                className="flex items-center justify-between gap-4 px-4 py-2 text-sm"
              >
                <span>{t(a.labelKey)}</span>
                <ShortcutField
                  value={settings.shortcuts[a.key]}
                  onChange={(v) =>
                    void update({ shortcuts: { ...settings.shortcuts, [a.key]: v } })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <PluginsSection />

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('settings.updates')}</h2>
        <div className="flex items-center gap-3 rounded-2xl bg-surface-container p-4 text-sm">
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

      <StorageSection />

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('settings.diagnostics')}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 rounded-2xl bg-surface-container p-4 text-sm">
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

      <section className="flex flex-col gap-2 text-sm text-fg-muted">
        <h2 className="font-semibold text-fg">{t('settings.about')}</h2>
        <p>{t('about.text')}</p>
        <p className="text-xs text-fg-subtle">{t('about.disclaimer')}</p>
      </section>
    </div>
  );
}
