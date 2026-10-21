import { cn } from '@melodesk/ui';
import { NavLink } from 'react-router';
import { Slot, useContribution, type NavItem } from '../core';
import { useT } from '../i18n';

function NavEntry({ item }: { item: NavItem }) {
  const t = useT();
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      className={({ isActive }) =>
        cn(
          'flex h-(--nav-h) items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-(--duration-fast)',
          isActive
            ? 'bg-accent-soft font-medium text-accent'
            : 'text-fg-muted hover:bg-bg-overlay hover:text-fg',
        )
      }
    >
      <item.icon className="size-5" />
      {t(item.label)}
    </NavLink>
  );
}

/** On narrow windows the sidebar becomes a tab bar along the bottom: the same entries, icons over labels. */
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
      className="flex border-t border-border bg-bg-elevated md:hidden"
    >
      {tabs.map((n) => (
        <NavLink
          key={`${n.featureId}:${n.id}`}
          to={n.to}
          end={n.end ?? false}
          className={({ isActive }) =>
            cn(
              'flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pt-2 pb-1.5 text-[11px]',
              isActive ? 'font-medium text-accent' : 'text-fg-muted',
            )
          }
        >
          <n.icon className="size-5" />
          <span className="max-w-full truncate">{t(n.label)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** The sidebar is assembled from what features contribute: navigation entries and sections. */
export function Sidebar() {
  const t = useT();
  const nav = useContribution('nav');
  const main = nav.filter((n) => (n.placement ?? 'main') === 'main');
  const bottom = nav.filter((n) => n.placement === 'bottom');
  return (
    <nav
      aria-label={t('nav.primary')}
      className="hidden h-full min-h-0 flex-col bg-bg-elevated bg-[image:linear-gradient(to_bottom,var(--color-accent-soft),transparent_45%)] md:flex"
    >
      <div data-tauri-drag-region className="h-10 shrink-0" />
      <div className="flex flex-col gap-1 px-3">
        {main.map((n) => (
          <NavEntry key={`${n.featureId}:${n.id}`} item={n} />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <Slot name="sidebar.sections" />
      </div>
      {bottom.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border/60 p-3">
          {bottom.map((n) => (
            <NavEntry key={`${n.featureId}:${n.id}`} item={n} />
          ))}
        </div>
      )}
    </nav>
  );
}
