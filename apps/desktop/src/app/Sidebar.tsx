import { cn } from '@melodesk/ui';
import { NavLink } from 'react-router';
import { Slot, useContribution, type NavItem } from '../core';
import { useT } from '../i18n';

/**
 * One navigation entry in three shapes, after Material's window size classes. Below `rail` it is a
 * tab in the bottom bar and from `rail` to `wide` an item of the navigation rail: icon in a pill that
 * lights up when current, label underneath. From `wide` it is a row in the full sidebar.
 * `tab` forces the first shape (the bottom bar is always that).
 */
function NavEntry({ item, tab = false }: { item: NavItem; tab?: boolean }) {
  const t = useT();
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      className={({ isActive }) =>
        cn(
          'flex min-w-0 flex-col items-center gap-1 text-[11px] transition-colors duration-(--duration-fast)',
          isActive ? 'font-medium text-fg' : 'text-fg-muted hover:text-fg',
          !tab &&
            'rounded-lg py-1 wide:h-(--nav-h) wide:flex-row wide:gap-3 wide:px-3 wide:py-0 wide:text-sm',
          !tab &&
            (isActive
              ? 'wide:bg-accent-soft wide:text-accent'
              : 'wide:hover:bg-bg-overlay wide:hover:text-fg'),
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'grid h-8 w-16 place-items-center rounded-full transition-colors duration-(--duration-fast)',
              isActive ? 'bg-accent-soft text-accent' : 'hover:bg-bg-overlay',
              !tab && 'wide:h-auto wide:w-auto wide:bg-transparent wide:hover:bg-transparent',
            )}
          >
            <item.icon className="size-5" />
          </span>
          <span className="max-w-full truncate">{t(item.label)}</span>
        </>
      )}
    </NavLink>
  );
}

/** Narrow windows: the same entries as a floating bar under the player. */
export function BottomNav() {
  const t = useT();
  const nav = useContribution('nav');
  const tabs = [
    ...nav.filter((n) => (n.placement ?? 'main') === 'main'),
    ...nav.filter((n) => n.placement === 'bottom'),
  ];
  return (
    <nav
      aria-label={t('nav.primary')}
      className="mx-2 mt-1.5 mb-2 flex rounded-3xl border border-border/60 bg-bg-elevated px-1 py-1.5 shadow-lg rail:hidden"
    >
      {tabs.map((n) => (
        <div key={`${n.featureId}:${n.id}`} className="flex min-w-0 flex-1 justify-center">
          <NavEntry item={n} tab />
        </div>
      ))}
    </nav>
  );
}

/** The side navigation: a rail with labels under the icons, widening to the full sidebar. */
export function Sidebar() {
  const t = useT();
  const nav = useContribution('nav');
  const main = nav.filter((n) => (n.placement ?? 'main') === 'main');
  const bottom = nav.filter((n) => n.placement === 'bottom');
  return (
    <nav
      aria-label={t('nav.primary')}
      className="hidden h-full min-h-0 flex-col bg-bg-elevated bg-[image:linear-gradient(to_bottom,var(--color-accent-soft),transparent_45%)] rail:flex"
    >
      <div data-tauri-drag-region className="h-10 shrink-0" />
      <div className="flex flex-col gap-2 px-2 wide:gap-1 wide:px-3">
        {main.map((n) => (
          <NavEntry key={`${n.featureId}:${n.id}`} item={n} />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col max-wide:hidden">
        <Slot name="sidebar.sections" />
      </div>
      <div className="flex-1 wide:hidden" />
      {bottom.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border/60 p-2 wide:gap-1 wide:p-3">
          {bottom.map((n) => (
            <NavEntry key={`${n.featureId}:${n.id}`} item={n} />
          ))}
        </div>
      )}
    </nav>
  );
}
