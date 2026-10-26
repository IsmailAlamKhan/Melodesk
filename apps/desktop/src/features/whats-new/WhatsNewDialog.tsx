import { Button, Dialog } from '@melodesk/ui';
import { useT } from '../../i18n/index';
import { useWhatsNew } from './store';

/** What is new: after an update it lists what came since the last version you ran; by hand, all of it. */
export function WhatsNewDialog() {
  const t = useT();
  const shown = useWhatsNew((s) => s.shown);
  const close = useWhatsNew((s) => s.close);
  if (!shown) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={t('whatsNew.title')}
      description={shown.afterUpdate ? t('whatsNew.afterUpdate') : t('whatsNew.intro')}
      className="max-h-[85vh] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto"
      closeLabel={t('common.close')}
    >
      <div className="flex flex-col gap-5">
        {shown.releases.map((r) => (
          <section key={r.version} aria-label={t('whatsNew.version', { version: r.version })}>
            <h3 className="font-display text-base font-semibold">
              {t('whatsNew.version', { version: r.version })}
            </h3>
            <ul className="mt-2 flex list-disc flex-col gap-1.5 ps-5 text-sm text-fg-muted marker:text-accent">
              {r.highlights.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={close}>
          {t('whatsNew.gotIt')}
        </Button>
      </div>
    </Dialog>
  );
}
