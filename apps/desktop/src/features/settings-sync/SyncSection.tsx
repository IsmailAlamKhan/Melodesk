import { Button, inputClass } from '@melodesk/ui';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Cloud, Copy, FolderSync, GitBranch, KeyRound, RefreshCw, Server } from 'lucide-react';
import { useState } from 'react';
import { useT } from '../../i18n/index';
import {
  cancelGithubSignIn,
  chooseFolder,
  signInToGithub,
  stopSyncing,
  syncNow,
  connectCloud,
  connectServer,
  hideSyncCode,
  showSyncCode,
  useSync,
} from './controller';

/** Keep settings the same on several computers, with as little to do as possible. */
export function SyncSection() {
  const t = useT();
  const {
    mode,
    folder,
    git,
    account,
    status,
    lastAt,
    error,
    clouds,
    githubAvailable,
    signIn,
    serverUrl,
    serverDefault,
    shownCode,
  } = useSync();
  const [customServer, setCustomServer] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [typedCode, setTypedCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const serverAddress = address ?? serverUrl ?? '';
  const [problem, setProblem] = useState<string | null>(null);

  const attempt = async (work: () => Promise<void>): Promise<void> => {
    setProblem(null);
    try {
      await work();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
  };

  const pick = (): Promise<void> =>
    attempt(async () => {
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked === 'string') await chooseFolder(picked);
    });

  const shownProblem =
    problem === 'bad-code'
      ? t('sync.server.badCode')
      : problem === 'no-such-code'
        ? t('sync.server.noSuchCode')
        : problem;

  const shownError =
    shownProblem ??
    (error === 'not-ours'
      ? t('sync.notOurs')
      : error === 'github-signed-out'
        ? t('sync.github.signedOut')
        : error === 'wrong-code' || error === 'no-code'
          ? t('sync.server.lostCode')
          : error === 'conflict'
            ? t('sync.server.conflict')
            : error
              ? t('sync.failed', { error })
              : null);
  const cloudName = clouds.find((c) => folder?.startsWith(c.path))?.name;
  const where =
    mode === 'server'
      ? t('sync.where.server')
      : mode === 'github'
        ? account
          ? t('sync.where.githubAs', { account })
          : t('sync.where.github')
        : cloudName
          ? t('sync.where.cloud', { name: cloudName })
          : t('sync.where.folder');

  return (
    <section className="flex flex-col gap-3" aria-labelledby="sync-title">
      <h2 id="sync-title" className="font-semibold">
        {t('sync.title')}
      </h2>
      <p className="text-sm text-fg-muted">{t('sync.body')}</p>
      <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-bg-elevated p-4">
        {mode === 'off' ? (
          <>
            <p className="text-sm text-fg-muted">{t('sync.off')}</p>
            <div className="flex flex-wrap gap-2">
              {clouds.map((c) => (
                <Button
                  key={c.id}
                  variant="primary"
                  onClick={() => void attempt(() => connectCloud(c.id))}
                >
                  <Cloud className="size-4" />
                  {t('sync.useCloud', { name: c.name })}
                </Button>
              ))}
              {githubAvailable && (
                <Button
                  variant={clouds.length > 0 ? 'ghost' : 'primary'}
                  disabled={signIn !== null && signIn.state !== 'error'}
                  onClick={() => void signInToGithub()}
                >
                  <GitBranch className="size-4" />
                  {t('sync.github.signIn')}
                </Button>
              )}
              <Button variant="ghost" onClick={() => void pick()}>
                <FolderSync className="size-4" />
                {t('sync.chooseOther')}
              </Button>
            </div>
            {clouds.length === 0 && <p className="text-xs text-fg-subtle">{t('sync.noClouds')}</p>}
            <div className="flex flex-col gap-2 rounded-xl bg-bg-overlay p-3">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <Server className="size-4" />
                {t('sync.server.title')}
              </h3>
              <p className="text-xs text-fg-muted">{t('sync.server.body')}</p>
              {/* Normally the Melodesk server is built in and there is nothing to type. */}
              {(serverDefault === null || customServer) && (
                <label className="flex flex-col gap-1 text-xs text-fg-muted">
                  {t('sync.server.address')}
                  <input
                    className={inputClass}
                    value={serverAddress}
                    placeholder="https://your-server.example.com"
                    onChange={(e) => {
                      setAddress(e.target.value);
                    }}
                  />
                </label>
              )}
              {joining && (
                <label className="flex flex-col gap-1 text-xs text-fg-muted">
                  {t('sync.server.codeLabel')}
                  <input
                    className={`${inputClass} font-mono`}
                    value={typedCode}
                    placeholder="ABCD-EFGH-IJKL-MNOP-QRST"
                    onChange={(e) => {
                      setTypedCode(e.target.value);
                    }}
                  />
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                {joining ? (
                  <>
                    <Button
                      variant="primary"
                      disabled={connecting || !serverAddress.trim() || !typedCode.trim()}
                      onClick={() => {
                        setConnecting(true);
                        void attempt(() => connectServer(serverAddress, typedCode)).finally(() => {
                          setConnecting(false);
                        });
                      }}
                    >
                      {t('sync.server.join')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setJoining(false);
                        setTypedCode('');
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      disabled={connecting || !serverAddress.trim()}
                      onClick={() => {
                        setConnecting(true);
                        void attempt(() => connectServer(serverAddress)).finally(() => {
                          setConnecting(false);
                        });
                      }}
                    >
                      {t('sync.server.start')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setJoining(true);
                      }}
                    >
                      <KeyRound className="size-4" />
                      {t('sync.server.haveCode')}
                    </Button>
                  </>
                )}
              </div>
              {serverDefault !== null && (
                <button
                  type="button"
                  className="self-start text-xs text-fg-subtle underline-offset-2 hover:underline"
                  onClick={() => {
                    setCustomServer((c) => !c);
                    setAddress(null);
                  }}
                >
                  {customServer ? t('sync.server.useDefault') : t('sync.server.useOwn')}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm">{where}</p>
            {folder && (
              <p className="text-xs text-fg-muted">
                <code className="break-all">{folder}</code>
              </p>
            )}
            <p className="text-xs text-fg-subtle" role="status">
              {status === 'syncing'
                ? t('sync.syncing')
                : lastAt
                  ? t('sync.last', { time: new Date(lastAt).toLocaleString() })
                  : t('sync.never')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                disabled={status === 'syncing'}
                onClick={() => void syncNow()}
              >
                <RefreshCw className="size-4" />
                {t('sync.now')}
              </Button>
              {mode === 'server' && (
                <Button variant="ghost" onClick={() => void attempt(showSyncCode)}>
                  <KeyRound className="size-4" />
                  {t('sync.server.showCode')}
                </Button>
              )}
              <Button variant="ghost" onClick={() => void stopSyncing()}>
                {t('sync.stop')}
              </Button>
            </div>
          </>
        )}

        {shownCode && (
          <div
            className="flex flex-col gap-2 rounded-xl bg-bg-overlay p-3"
            role="group"
            aria-label={t('sync.server.yourCode')}
          >
            <p className="text-sm">{t('sync.server.writeDown')}</p>
            <p
              className="font-mono text-2xl tracking-widest"
              aria-label={t('sync.server.yourCode')}
            >
              {shownCode}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(shownCode);
                }}
              >
                <Copy className="size-4" />
                {t('sync.server.copy')}
              </Button>
              <Button variant="primary" onClick={hideSyncCode}>
                {t('sync.server.saved')}
              </Button>
            </div>
            <p className="text-xs text-fg-subtle">{t('sync.server.noRecovery')}</p>
          </div>
        )}

        {signIn && (
          <div
            className="flex flex-col gap-2 rounded-xl bg-bg-overlay p-3"
            role="group"
            aria-label={t('sync.github.signIn')}
          >
            {signIn.state === 'starting' && <p className="text-sm">{t('sync.github.starting')}</p>}
            {signIn.state === 'waiting' && (
              <>
                <p className="text-sm">{t('sync.github.type')}</p>
                <p
                  className="font-mono text-2xl tracking-widest"
                  aria-label={t('sync.github.code')}
                >
                  {signIn.code}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (signIn.uri) void openUrl(signIn.uri);
                    }}
                  >
                    {t('sync.github.open')}
                  </Button>
                  <Button variant="ghost" onClick={cancelGithubSignIn}>
                    {t('common.cancel')}
                  </Button>
                </div>
                <p className="text-xs text-fg-subtle">{t('sync.github.only')}</p>
              </>
            )}
            {signIn.state === 'denied' && (
              <p className="text-sm text-danger">{t('sync.github.denied')}</p>
            )}
            {signIn.state === 'expired' && (
              <p className="text-sm text-danger">{t('sync.github.expired')}</p>
            )}
            {signIn.state === 'error' && (
              <p role="alert" className="text-sm text-danger">
                {t('sync.failed', { error: signIn.error ?? '' })}
              </p>
            )}
            {(signIn.state === 'denied' ||
              signIn.state === 'expired' ||
              signIn.state === 'error') && (
              <div>
                <Button variant="ghost" onClick={cancelGithubSignIn}>
                  {t('common.close')}
                </Button>
              </div>
            )}
          </div>
        )}

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
