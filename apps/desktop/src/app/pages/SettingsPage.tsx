import { Button } from '@melodesk/ui';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useEffect, useState } from 'react';
import { useAccount } from '../../data/hooks';
import { sendCommand, setPlayerVisible } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';
import { SHORTCUT_ACTIONS, useSettings } from '../../settings/store';
import { ShortcutField } from '../components/ShortcutField';
import { PluginsSection } from '../components/PluginsSection';
import { AppearanceSection } from '../components/AppearanceSection';
import { toast } from '../toast';

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
    <label className="flex items-center justify-between gap-4 rounded-lg border border-border bg-bg-elevated px-4 py-3">
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
      <h1 className="font-display text-3xl font-bold tracking-tight">Settings</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Account</h2>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-elevated p-4">
          {account.data?.avatarUrl && (
            <img src={account.data.avatarUrl} alt="" className="size-10 rounded-full" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              {account.data?.signedIn ? account.data.name : 'Not signed in'}
            </div>
            <div className="truncate text-xs text-fg-muted">
              {account.data?.handle ??
                'Sign in happens on Google’s own page inside the player window.'}
            </div>
          </div>
          {account.data?.signedIn ? (
            <>
              <Button onClick={() => void setPlayerVisible(true)}>Switch account</Button>
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
                Sign out
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => void setPlayerVisible(true)}>
              Sign in
            </Button>
          )}
        </div>
      </section>

      <AppearanceSection />

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Desktop</h2>
        {settings && (
          <>
            <Toggle
              label="Keep playing when the window is closed"
              hint={
                isMac
                  ? 'Closing the window hides it; Melodesk stays in the menu bar and Dock.'
                  : 'Closing the window hides it to the system tray.'
              }
              checked={settings.closeToTray}
              onChange={(v) => void update({ closeToTray: v })}
            />
            <Toggle
              label="Launch at login"
              checked={settings.launchAtLogin}
              onChange={(v) => void update({ launchAtLogin: v })}
            />
            <Toggle
              label="Notify when the track changes"
              hint="Only while Melodesk is not the focused window."
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
            {playerVisible ? 'Hide player window' : 'Show player window'}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Global shortcuts</h2>
        <p className="text-sm text-fg-muted">
          Work even when Melodesk is in the background. Media keys are handled by the system and
          need no setup.
        </p>
        {settings && (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-bg-elevated">
            {SHORTCUT_ACTIONS.map((a) => (
              <div
                key={a.key}
                className="flex items-center justify-between gap-4 px-4 py-2 text-sm"
              >
                <span>{a.label}</span>
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
        <h2 className="font-semibold">Updates</h2>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-elevated p-4 text-sm">
          <div className="flex-1">
            <div>Melodesk {version || '—'}</div>
            <div className="text-xs text-fg-muted">
              {updateState === 'none' && 'You’re up to date.'}
              {updateState === 'checking' && 'Checking…'}
              {updateState === 'downloading' && `Downloading ${updateInfo ?? ''}`}
              {updateState === 'ready' && 'Update installed. Restart to apply.'}
              {updateState === 'error' && (updateInfo ?? 'Update check failed.')}
              {updateState === 'idle' &&
                'Updates are signed and downloaded from the project’s GitHub releases. Nothing is sent about you.'}
            </div>
          </div>
          {updateState === 'ready' ? (
            <Button variant="primary" onClick={() => void relaunch()}>
              Restart
            </Button>
          ) : (
            <Button
              disabled={updateState === 'checking' || updateState === 'downloading'}
              onClick={() => void checkForUpdates()}
            >
              Check for updates
            </Button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Diagnostics</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 rounded-lg border border-border bg-bg-elevated p-4 text-sm">
          <dt className="text-fg-subtle">Bridge</dt>
          <dd>{bridgeVersion ?? '—'}</dd>
          <dt className="text-fg-subtle">Health</dt>
          <dd>
            {health.status}
            {health.reason ? ` (${health.reason})` : ''}
          </dd>
          <dt className="text-fg-subtle">Page APIs</dt>
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
            toast('Copied diagnostics');
          }}
        >
          Copy diagnostics
        </Button>
      </section>

      <section className="flex flex-col gap-2 text-sm text-fg-muted">
        <h2 className="font-semibold text-fg">About</h2>
        <p>
          Melodesk is an open-source desktop client that drives the official YouTube Music web
          player. MIT licensed.
        </p>
        <p className="text-xs text-fg-subtle">
          Melodesk is not affiliated with, endorsed by, or sponsored by Google LLC or YouTube.
          YouTube and YouTube Music are trademarks of Google LLC.
        </p>
      </section>
    </div>
  );
}
