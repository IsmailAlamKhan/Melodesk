/**
 * The feature system: how the app is assembled from independent modules.
 *
 * A feature is a folder under `src/features/<id>/` whose `index.ts(x)` default-exports a
 * `defineFeature({...})`. The app finds those folders at build time (see `discover.ts`), so adding a
 * folder plugs a feature in and deleting it removes it: nothing else needs editing. A feature
 * declares what it adds at named extension points (routes, sidebar entries, panels, overlays, slots,
 * commands, context-menu entries, settings sections, windows) and may run code while it is active.
 * Users can switch features on and off at runtime from Settings; its contributions disappear and its
 * `start()` is cleaned up.
 *
 * Features are trusted, first-party modules with full access to the app. The permission-gated
 * `@melodesk/plugins` SDK is the separate layer for sandboxed integrations (scrobbling, Discord…).
 */
import type { LucideIcon } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import type { MessageKey } from '../i18n';
import type { MenuEntry } from '../app/components/menu';
import type { Track, ViewSort } from '../app/components/trackSort';

/** Named places in the UI that features can add components to, with the props each one passes. */
export interface SlotMap {
  /** Buttons on the right of the top bar, after the panel toggles. */
  'topBar.end': object;
  /** The search field in the middle of the top bar. */
  'topBar.center': object;
  /** Extra controls at the right end of the player bar. */
  'playerBar.end': object;
  /** Extra sections in the sidebar, below the main navigation. */
  'sidebar.sections': object;
  /** Buttons on the right of the full-screen Now Playing header. */
  'nowPlaying.header': object;
  /** A column shown beside the artwork in full-screen Now Playing. */
  'nowPlaying.side': object;
  /** Buttons in the lyrics toolbar. */
  'lyrics.toolbar': object;
  /** Actions in the header of the queue panel. */
  'queue.header': object;
  /** Actions in a playlist's header. */
  'playlist.header': {
    title: string;
    playlistId: string | null;
    tracks: Track[];
    editable: boolean;
    viewSort: ViewSort | null;
    onViewSort: (sort: ViewSort | null) => void;
  };
}
export type SlotName = keyof SlotMap;

export interface SlotItem<P = object> {
  id: string;
  /** Lower comes first (default 100). */
  order?: number;
  component: ComponentType<P>;
}

export interface NavItem {
  id: string;
  to: string;
  label: MessageKey;
  icon: LucideIcon;
  order?: number;
  end?: boolean;
  /** `main` is the list at the top of the sidebar, `bottom` the pinned area above the footer. */
  placement?: 'main' | 'bottom';
}

/** A panel in the column to the right of the page, toggled from the top bar. */
export interface Panel {
  id: string;
  label: MessageKey;
  icon: LucideIcon;
  order?: number;
  component: ComponentType;
}

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

/** What the context menu knows about the click, for features that add entries. */
export interface MenuContext {
  hasTrack: boolean;
}

export interface MenuContribution {
  /** `root` is the top level, `go` the "Go to" submenu, `view` the "View" submenu. */
  menu: 'root' | 'go' | 'view';
  order?: number;
  entries: (ctx: MenuContext) => MenuEntry[];
}

export interface SettingsSection {
  id: string;
  order?: number;
  component: ComponentType;
}

export interface Contributions {
  routes?: RouteObject[];
  nav?: NavItem[];
  panels?: Panel[];
  /** Always-mounted components outside the page (full-screen views, dialogs hosts, toasts). */
  overlays?: { id: string; order?: number; component: ComponentType }[];
  /** Components that wrap the whole app (providers); earlier orders are outermost. */
  providers?: { id: string; order?: number; component: ComponentType<{ children: ReactNode }> }[];
  slots?: { [K in SlotName]?: SlotItem<SlotMap[K]>[] };
  /** Commands for the command palette, evaluated when it renders. */
  commands?: () => PaletteCommand[];
  menus?: MenuContribution[];
  settings?: SettingsSection[];
  /** Content of extra native windows, keyed by the `?window=` name (for example `mini`). */
  windows?: Record<string, ComponentType>;
}

export interface Feature {
  /** Stable lowercase id, unique across features; also the folder name by convention. */
  id: string;
  name: MessageKey;
  description: MessageKey;
  icon?: LucideIcon;
  /** Always on and hidden from the Features list: the app does not work without it. */
  core?: boolean;
  /** Whether it is on until the user says otherwise (default true). */
  defaultEnabled?: boolean;
  /** Features that must be active for this one to be. Imports of other features need this. */
  dependsOn?: string[];
  /** Native modules it needs (for example `discord`); inactive if the build lacks them. */
  requires?: string[];
  contributes?: Contributions;
  /**
   * Runs when the feature becomes active (in the main window unless `scope` is `all`). Return a
   * function to undo what it did (anything else is ignored); it runs when the feature is switched off.
   */
  start?: () => unknown;
  scope?: 'main' | 'all';
}

/** Identity helper that gives a feature definition its types. */
export function defineFeature(feature: Feature): Feature {
  return feature;
}
