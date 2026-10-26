import { Button } from '@melodesk/ui';
import { Img } from '../../core';
import { useAccount } from '../../data/hooks';
import { useT } from '../../i18n/index';
import { sendCommand, setPlayerVisible } from '../../player/ipc';

export function AccountSection() {
  const t = useT();
  const account = useAccount();
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{t('settings.account')}</h2>
      <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-bg-elevated p-4">
        {account.data?.avatarUrl && (
          <Img src={account.data.avatarUrl} alt="" className="size-10 rounded-full" />
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
  );
}
