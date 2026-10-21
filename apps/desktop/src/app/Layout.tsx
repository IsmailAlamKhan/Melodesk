import { IconButton, cn } from '@melodesk/ui';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { AppProviders, FeatureBoundary, Slot, useContribution } from '../core';
import { useT } from '../i18n';
import { usePlayerStore } from '../player/store';
import { HealthBanner } from './HealthBanner';
import { PageCrashed } from './PageCrashed';
import { PlayerBar } from './PlayerBar';
import { DialogHost } from './dialogs/DialogHost';
import { BottomNav, Sidebar } from './Sidebar';
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
  const location = useLocation();
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
          // Wide: sidebar | page | optional panel, player bar underneath. Narrow (< 768px): the page
          // alone, with the player bar and a tab bar stacked under it; panels open full screen.
          'grid h-full grid-cols-1 grid-rows-[minmax(0,1fr)_auto_auto] rail:grid-rows-[minmax(0,1fr)_auto]',
          active
            ? 'rail:grid-cols-[80px_1fr] wide:grid-cols-[220px_1fr_320px]'
            : 'rail:grid-cols-[80px_1fr] wide:grid-cols-[220px_1fr]',
        )}
      >
        <Sidebar />
        <div data-content className="flex min-h-0 min-w-0 flex-col">
          <div
            data-tauri-drag-region
            className="topbar-inset flex h-14 shrink-0 items-center gap-1 px-3 pt-2 rail:gap-2"
          >
            <IconButton label={t('nav.back')} size="sm" onClick={() => navigate(-1)}>
              <ChevronLeft className="rtl:-scale-x-100" />
            </IconButton>
            <IconButton
              label={t('nav.forward')}
              size="sm"
              className="max-rail:hidden"
              onClick={() => navigate(1)}
            >
              <ChevronRight className="rtl:-scale-x-100" />
            </IconButton>
            <div className="flex min-w-0 flex-1 justify-center">
              <Slot name="topBar.center" />
            </div>
            {panels.map((p) => (
              <IconButton
                key={`${p.featureId}:${p.id}`}
                label={t(p.label)}
                size="sm"
                aria-pressed={openPanel === p.id}
                onClick={() => togglePanel(p.id)}
                className={cn('shrink-0', openPanel === p.id && 'text-accent')}
              >
                <p.icon />
              </IconButton>
            ))}
            <Slot name="topBar.end" />
          </div>
          <HealthBanner />
          <main className={cn('min-h-0 flex-1 overflow-y-auto', !ready && 'opacity-80')}>
            {/* A page that throws shows an apology and a way out instead of a blank window; the
                key gives the next page a fresh start. */}
            <FeatureBoundary key={location.pathname} featureId="page" fallback={<PageCrashed />}>
              <Outlet />
            </FeatureBoundary>
          </main>
        </div>
        {active && (
          <aside
            aria-label={t(active.label)}
            className="flex min-h-0 flex-col border-s border-border bg-bg-elevated max-wide:fixed max-wide:inset-0 max-wide:z-40 max-wide:border-s-0 max-wide:bg-bg"
          >
            <div data-tauri-drag-region className="h-10 shrink-0 max-wide:hidden" />
            <div className="panel-inset flex h-14 shrink-0 items-center justify-between px-3 pt-2 wide:hidden">
              <span className="font-semibold">{t(active.label)}</span>
              <IconButton
                label={t('common.close')}
                size="sm"
                onClick={() => togglePanel(active.id)}
              >
                <X />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1">
              <FeatureBoundary featureId={active.featureId}>
                <active.component />
              </FeatureBoundary>
            </div>
          </aside>
        )}
        <div
          className={cn(
            'max-rail:px-2',
            active ? 'rail:col-span-2 wide:col-span-3' : 'rail:col-span-2',
          )}
        >
          <PlayerBar />
        </div>
        <BottomNav />
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
