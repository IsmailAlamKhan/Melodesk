import { Button } from '@melodesk/ui';
import { useT } from '../../../i18n/index';
import { setPlayerVisible } from '../../../player/ipc';
import { usePlayerStore } from '../../../player/store';
import { useSettings } from '../../../settings/store';
import { Toggle } from './Toggle';

export function DesktopSection() {
  const t = useT();
  const playerVisible = usePlayerStore((s) => s.playerVisible);
  const settings = useSettings((s) => s.settings);
  const settingsError = useSettings((s) => s.error);
  const update = useSettings((s) => s.update);
  const isMac = navigator.userAgent.includes('Macintosh');
  return (
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
  );
}
