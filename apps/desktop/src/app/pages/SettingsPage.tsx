import { Button } from '@melodesk/ui';
import { useAccount } from '../../data/hooks';
import { sendCommand, setPlayerVisible } from '../../player/ipc';
import { usePlayerStore } from '../../player/store';

export function SettingsPage() {
  const account = useAccount();
  const playerVisible = usePlayerStore((s) => s.playerVisible);
  const bridgeVersion = usePlayerStore((s) => s.bridgeVersion);
  const health = usePlayerStore((s) => s.health);
  const capabilities = usePlayerStore((s) => s.capabilities);
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
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Player window</h2>
        <p className="text-sm text-fg-muted">
          The official YouTube Music web player runs in its own window. Show it to sign in, switch
          accounts, or use anything Melodesk doesn’t cover yet.
        </p>
        <div>
          <Button onClick={() => void setPlayerVisible(!playerVisible)}>
            {playerVisible ? 'Hide player window' : 'Show player window'}
          </Button>
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
      </section>
      <p className="text-xs text-fg-subtle">
        Melodesk is not affiliated with Google or YouTube. YouTube Music is a trademark of Google
        LLC.
      </p>
    </div>
  );
}
