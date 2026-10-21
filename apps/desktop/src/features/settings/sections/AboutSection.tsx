import { useT } from '../../../i18n/index';

export function AboutSection() {
  const t = useT();
  return (
    <section className="flex flex-col gap-2 text-sm text-fg-muted">
      <h2 className="font-semibold text-fg">{t('settings.about')}</h2>
      <p>{t('about.text')}</p>
      <p className="text-xs text-fg-subtle">{t('about.disclaimer')}</p>
    </section>
  );
}
