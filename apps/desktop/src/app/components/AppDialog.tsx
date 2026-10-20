import { Dialog, type DialogProps } from '@melodesk/ui';
import { useT } from '../../i18n';

/** The shared Dialog with its close button labelled in the current language. */
export function AppDialog(props: Omit<DialogProps, 'closeLabel'>) {
  const t = useT();
  return <Dialog closeLabel={t('common.close')} {...props} />;
}
