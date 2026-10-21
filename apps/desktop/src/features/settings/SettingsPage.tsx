import { cn } from '@melodesk/ui';
import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { FeatureBoundary, useContribution } from '../../core';
import { useT } from '../../i18n/index';
import { CATEGORIES, DEFAULT_CATEGORY } from './categories';

/**
 * Settings is a few pages, one per category, each a stack of sections contributed by the features
 * they belong to (a feature that is off takes its sections with it, and a page with no sections
 * disappears from the list). Wide windows list the pages down the left; narrow ones show them as a
 * row of chips above the page. The page is in the address (`?section=appearance`), so other parts
 * of the app can link straight to it.
 */
export function SettingsPage() {
  const t = useT();
  const sections = useContribution('settings');
  const [params] = useSearchParams();
  const inCategory = (id: string) =>
    sections.filter((s) => (s.category ?? DEFAULT_CATEGORY) === id);
  const pages = CATEGORIES.filter((c) => inCategory(c.id).length > 0);
  const active = pages.find((c) => c.id === params.get('section')) ?? pages[0];

  const activeLink = useRef<HTMLAnchorElement>(null);
  // A new page starts at the top, not wherever the last one was scrolled to, and in the row of chips
  // the chosen one is brought into view.
  useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
    activeLink.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [active?.id]);

  return (
    <div className="mx-auto w-full max-w-5xl p-4 md:p-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
      <div className="mt-4 flex flex-col gap-4 wide:mt-6 wide:grid wide:grid-cols-[13rem_minmax(0,1fr)] wide:items-start wide:gap-10">
        <nav
          aria-label={t('settings.categories')}
          className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto bg-bg px-4 py-2 [scrollbar-width:none] md:-mx-6 md:px-6 wide:top-6 wide:mx-0 wide:flex-col wide:gap-1 wide:overflow-visible wide:bg-transparent wide:p-0"
        >
          {pages.map((c) => {
            const on = c.id === active?.id;
            return (
              <Link
                key={c.id}
                ref={on ? activeLink : undefined}
                to={`?section=${c.id}`}
                replace
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex h-10 shrink-0 items-center gap-2.5 rounded-full px-4 text-sm whitespace-nowrap transition-colors wide:rounded-lg wide:px-3',
                  on
                    ? 'bg-accent-soft font-medium text-accent'
                    : 'bg-bg-elevated text-fg-muted hover:text-fg wide:bg-transparent wide:hover:bg-bg-overlay',
                )}
              >
                <c.icon className="size-4.5" />
                {t(c.label)}
              </Link>
            );
          })}
        </nav>
        <div className="flex min-w-0 max-w-2xl flex-col gap-8">
          {active &&
            inCategory(active.id).map(({ id, featureId, component: Section }) => (
              <FeatureBoundary key={`${featureId}:${id}`} featureId={featureId}>
                <Section />
              </FeatureBoundary>
            ))}
        </div>
      </div>
    </div>
  );
}
