import { FeatureBoundary, useContribution } from '../../core';
import { useT } from '../../i18n/index';

/**
 * The settings page is a stack of sections, each contributed by the feature it belongs to, so a
 * feature that is off takes its settings with it.
 */
export function SettingsPage() {
  const t = useT();
  const sections = useContribution('settings');
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-4 md:p-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
      {sections.map(({ id, featureId, component: Section }) => (
        <FeatureBoundary key={`${featureId}:${id}`} featureId={featureId}>
          <Section />
        </FeatureBoundary>
      ))}
    </div>
  );
}
