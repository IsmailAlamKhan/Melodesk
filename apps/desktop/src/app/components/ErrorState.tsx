import { Button } from '@melodesk/ui';
import { AlertCircle } from 'lucide-react';
import { useT } from '../../i18n';

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center gap-3 p-12 text-center"
    >
      <AlertCircle className="size-8 text-danger" />
      <div className="font-medium">{t('error.loadPage')}</div>
      <code className="text-xs text-fg-subtle">{message}</code>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {t('common.tryAgain')}
        </Button>
      )}
    </div>
  );
}
