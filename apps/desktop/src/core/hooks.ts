import { useMemo, type ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import type {
  Contributions,
  Feature,
  MenuContribution,
  NavItem,
  PaletteCommand,
  Panel,
  SettingsSection,
  SlotItem,
  SlotMap,
  SlotName,
} from './feature';
import { useFeatures } from './registry';

interface Ordered {
  order?: number;
}
export type WithFeature<T> = T & { featureId: string };

const byOrder = (a: Ordered, b: Ordered): number => (a.order ?? 100) - (b.order ?? 100);

/** The features that are on right now. */
export function useActiveFeatures(): Feature[] {
  return useFeatures((s) => s.active);
}

export function useFeatureActive(id: string): boolean {
  return useFeatures((s) => s.active.some((f) => f.id === id));
}

type ListKey = 'nav' | 'panels' | 'overlays' | 'providers' | 'settings' | 'menus';
interface ListItem {
  nav: NavItem;
  panels: Panel;
  overlays: NonNullable<Contributions['overlays']>[number];
  providers: NonNullable<Contributions['providers']>[number];
  settings: SettingsSection;
  menus: MenuContribution;
}

/** Everything the active features contribute under `key`, ordered, each tagged with its feature. */
export function useContribution<K extends ListKey>(key: K): WithFeature<ListItem[K]>[] {
  const active = useActiveFeatures();
  return useMemo(() => {
    const out: WithFeature<ListItem[K]>[] = [];
    for (const f of active)
      for (const item of (f.contributes?.[key] ?? []) as ListItem[K][])
        out.push({ ...item, featureId: f.id });
    return out.sort(byOrder);
  }, [active, key]);
}

/** The route table assembled from the active features. */
export function useFeatureRoutes(): RouteObject[] {
  const active = useActiveFeatures();
  return useMemo(() => active.flatMap((f) => f.contributes?.routes ?? []), [active]);
}

export function useSlot<K extends SlotName>(name: K): WithFeature<SlotItem<SlotMap[K]>>[] {
  const active = useActiveFeatures();
  return useMemo(() => {
    const out: WithFeature<SlotItem<SlotMap[K]>>[] = [];
    for (const f of active)
      for (const item of f.contributes?.slots?.[name] ?? []) out.push({ ...item, featureId: f.id });
    return out.sort(byOrder);
  }, [active, name]);
}

/** Palette commands from every active feature. Call while rendering: they read live state. */
export function useCommands(): PaletteCommand[] {
  const active = useActiveFeatures();
  return active.flatMap((f) => {
    try {
      return f.contributes?.commands?.() ?? [];
    } catch (err) {
      console.error(`[features] ${f.id} commands failed`, err);
      return [];
    }
  });
}

/** The component an active feature provides for the native window `name`, if any. */
export function useWindowComponent(name: string): ComponentType | undefined {
  const active = useActiveFeatures();
  return useMemo(
    () => active.find((f) => f.contributes?.windows?.[name])?.contributes?.windows?.[name],
    [active, name],
  );
}
