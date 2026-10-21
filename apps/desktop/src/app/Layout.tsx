import { IconButton, cn } from '@melodesk/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Outlet, useNavigate } from 'react-router';
import { AppProviders, FeatureBoundary, Slot, useContribution } from '../core';
import { useT } from '../i18n';
import { usePlayerStore } from '../player/store';
import { HealthBanner } from './HealthBanner';
import { PlayerBar } from './PlayerBar';
import { DialogHost } from './dialogs/DialogHost';
import { Sidebar } from './Sidebar';
import { Toaster } from './components/Toaster';
import { useUiStore } from './uiStore';

/**
 * The fixed shell: sidebar, top bar, page, right-hand panel, player bar. Everything that varies
 * comes from features: nav entries, the search field and top-bar buttons, panels, full-screen
 * overlays and app-wide providers.
 */
export function Layout() {
  const t = useT();
  const navigate = useNavigate();
  const panels = useContribution('panels');
  const overlays = useContribution('overlays');
  const openPanel = useUiStore((s) => s.rightPanel);
  const togglePanel = useUiStore((s) => s.toggleRightPanel);
  const ready = usePlayerStore((s) => s.ready);
  const active = panels.find((p) => p.id === openPanel) ?? null;
  return (
    <AppProviders>
      <div
        className={cn(
          'grid h-full grid-rows-[minmax(0,1fr)_auto]',
          active ? 'grid-cols-[220px_1fr_320px]' : 'grid-cols-[220px_1fr]',
        )}
      >
        <Sidebar />
        <div data-content className="flex min-h-0 min-w-0 flex-col">
          <div data-tauri-drag-region className="flex h-14 shrink-0 items-center gap-2 px-3 pt-2">
            <IconButton label={t('nav.back')} size="sm" onClick={() => navigate(-1)}>
              <ChevronLeft className="rtl:-scale-x-100" />
            </IconButton>
            <IconButton label={t('nav.forward')} size="sm" onClick={() => navigate(1)}>
              <ChevronRight className="rtl:-scale-x-100" />
            </IconButton>
            <div className="flex flex-1 justify-center">
              <Slot name="topBar.center" />
            </div>
            {panels.map((p) => (
              <IconButton
                key={`${p.featureId}:${p.id}`}
                label={t(p.label)}
                size="sm"
                aria-pressed={openPanel === p.id}
                onClick={() => togglePanel(p.id)}
                className={cn(openPanel === p.id && 'text-accent')}
              >
                <p.icon />
              </IconButton>
            ))}
            <Slot name="topBar.end" />
          </div>
          <HealthBanner />
          <main className={cn('min-h-0 flex-1 overflow-y-auto', !ready && 'opacity-80')}>
            <Outlet />
          </main>
        </div>
        {active && (
          <aside
            aria-label={t(active.label)}
            className="flex min-h-0 flex-col border-s border-border bg-bg-elevated"
          >
            <div data-tauri-drag-region className="h-10 shrink-0" />
            <div className="min-h-0 flex-1">
              <FeatureBoundary featureId={active.featureId}>
                <active.component />
              </FeatureBoundary>
            </div>
          </aside>
        )}
        <div className={cn(active ? 'col-span-3' : 'col-span-2')}>
          <PlayerBar />
        </div>
        {overlays.map((o) => (
          <FeatureBoundary key={`${o.featureId}:${o.id}`} featureId={o.featureId}>
            <o.component />
          </FeatureBoundary>
        ))}
        <Toaster />
        <DialogHost />
      </div>
    </AppProviders>
  );
}
