import { Button } from '@melodesk/ui';
import { useNavigate } from 'react-router';
import { useT } from '../i18n';

/** What a page shows when it threw while rendering. The rest of the app keeps working. */
export function PageCrashed() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center"
    >
      <h1 className="font-display text-2xl font-semibold">{t('crash.title')}</h1>
      <p className="text-sm text-fg-muted">{t('crash.body')}</p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          {t('crash.reload')}
        </Button>
        <Button onClick={() => void navigate('/')}>{t('crash.home')}</Button>
      </div>
    </div>
  );
}
