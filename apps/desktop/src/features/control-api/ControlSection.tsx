import { Button, inputClass } from '@melodesk/ui';
import { Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from '../../app/toast';
import { useT } from '../../i18n/index';
import { curlExample, newToken, setControl, useControl, validPort } from './control';

function Code({ text }: { text: string }) {
  const t = useT();
  return (
    <div className="flex items-start gap-2 rounded-xl bg-bg-overlay p-2">
      <code className="min-w-0 flex-1 break-all text-xs">{text}</code>
      <button
        type="button"
        aria-label={t('control.copy')}
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            toast(t('control.copied'));
          });
        }}
        className="grid size-7 shrink-0 place-items-center rounded-full text-fg-muted hover:text-fg"
      >
        <Copy className="size-4" />
      </button>
    </div>
  );
}

/** Settings for the local control API (off until switched on). */
export function ControlSection() {
  const t = useT();
  const { enabled, port, token, error } = useControl();
  const [shown, setShown] = useState(false);
  const [portText, setPortText] = useState(String(port));
  return (
    <section className="flex flex-col gap-3" aria-labelledby="control-title">
      <h2 id="control-title" className="font-semibold">
        {t('control.title')}
      </h2>
      <p className="text-sm text-fg-muted">{t('control.body')}</p>
      <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-bg-elevated p-4">
        <label className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">{t('control.enable')}</span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={enabled}
            checked={enabled}
            onChange={(e) => void setControl({ enabled: e.target.checked })}
            className="size-4 accent-accent"
          />
        </label>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        {enabled && (
          <>
            <label className="flex flex-col gap-1 text-xs text-fg-muted">
              {t('control.port')}
              <input
                className={inputClass}
                value={portText}
                inputMode="numeric"
                onChange={(e) => {
                  setPortText(e.target.value);
                }}
                onBlur={() => {
                  const n = Number(portText);
                  if (validPort(n) && n !== port) void setControl({ port: n });
                  else setPortText(String(port));
                }}
              />
            </label>
            <div className="flex flex-col gap-1 text-xs text-fg-muted">
              {t('control.token')}
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-xl bg-bg-overlay px-3 py-2 text-sm text-fg">
                  {shown ? token : '•'.repeat(24)}
                </code>
                <Button
                  variant="ghost"
                  aria-label={shown ? t('control.hide') : t('control.show')}
                  onClick={() => {
                    setShown((v) => !v);
                  }}
                >
                  {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
                <Button variant="ghost" onClick={() => void setControl({ token: newToken() })}>
                  <RefreshCw className="size-4" />
                  {t('control.newToken')}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs text-fg-muted">{t('control.try')}</span>
              <Code text={curlExample(port, token, 'now')} />
              <Code text={curlExample(port, token, 'next')} />
              <Code text={curlExample(port, token, 'volume')} />
            </div>
          </>
        )}
        <p className="text-xs text-fg-subtle">{t('control.safe')}</p>
      </div>
    </section>
  );
}
