import { Compass, Home, Library } from 'lucide-react';
import { HealthBanner } from './HealthBanner';
import { PlayerBar } from './PlayerBar';
import { Welcome } from './Welcome';

export function App() {
  return (
    <div className="grid h-full grid-cols-[220px_1fr] grid-rows-[1fr_auto]">
      <nav
        aria-label="Primary"
        className="flex flex-col gap-1 border-r border-border bg-bg-elevated p-3 pt-10"
      >
        <div className="mb-4 px-2 font-display text-lg font-semibold tracking-tight">Melodesk</div>
        <NavItem icon={<Home />} label="Home" active />
        <NavItem icon={<Compass />} label="Explore" />
        <NavItem icon={<Library />} label="Library" />
      </nav>
      <main className="flex min-w-0 flex-col overflow-y-auto">
        <HealthBanner />
        <Welcome />
      </main>
      <div className="col-span-2">
        <PlayerBar />
      </div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      className={
        'flex h-9 items-center gap-3 rounded-md px-2 text-sm transition-colors duration-(--duration-fast) [&>svg]:size-5 ' +
        (active ? 'bg-bg-overlay text-fg' : 'text-fg-muted hover:bg-bg-overlay hover:text-fg')
      }
    >
      {icon}
      {label}
    </button>
  );
}
