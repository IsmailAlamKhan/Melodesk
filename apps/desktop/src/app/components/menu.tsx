import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Ban,
  Bookmark,
  BookmarkCheck,
  Check,
  ChevronRight,
  CircleHelp,
  Disc3,
  Flag,
  Heart,
  HeartOff,
  ListEnd,
  ListPlus,
  ListStart,
  MessageSquare,
  Pause,
  Play,
  Radio,
  Search,
  Settings,
  Share2,
  Shuffle,
  Trash2,
  User,
  UserPlus,
  Users,
  Volume2,
} from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

/** One look for every menu in the app: right-click menus and "more" dropdowns alike. */
export const menuContent =
  'menu-surface z-[90] max-h-(--radix-popper-available-height) min-w-56 max-w-80 overflow-y-auto rounded-2xl bg-surface-container p-2 text-sm shadow-xl';
export const menuItem =
  'type-label-large flex cursor-default select-none items-center gap-3 rounded-xl px-3 py-2.5 text-on-surface outline-none ' +
  'data-[highlighted]:bg-state-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-40 ' +
  '[&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:text-on-surface-variant';
export const menuDanger = 'text-error data-[highlighted]:bg-error-container/40 [&>svg]:text-error!';
export const menuSeparator = 'my-2 h-px bg-outline-variant';
export const menuHeading = 'type-label-medium px-3 pt-2 pb-1 text-on-surface-variant';
export const menuHint = 'type-label-medium ms-auto ps-6 text-on-surface-variant';

export interface ActionEntry {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Keyboard shortcut shown on the right, e.g. "⌘K". */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void | Promise<void>;
}

/** An entry that opens a nested menu. */
export interface SubmenuEntry {
  key: string;
  label: string;
  icon?: ReactNode;
  submenu: readonly MenuEntry[];
}

export type MenuEntry =
  ActionEntry | SubmenuEntry | { key: string; separator: true } | { key: string; heading: string };

const ICONS: Record<string, ReactNode> = {
  SHARE: <Share2 />,
  MIX: <Radio />,
  PLAY_ARROW: <Play />,
  PAUSE: <Pause />,
  VOLUME_UP: <Volume2 />,
  ADD_TO_PLAYLIST: <ListPlus />,
  QUEUE_PLAY_NEXT: <ListStart />,
  ADD_TO_REMOTE_QUEUE: <ListEnd />,
  MUSIC_SHUFFLE: <Shuffle />,
  ARTIST: <User />,
  SUBSCRIBE: <UserPlus />,
  FAVORITE: <Heart />,
  UNFAVORITE: <HeartOff />,
  BOOKMARK_BORDER: <Bookmark />,
  BOOKMARK: <BookmarkCheck />,
  CHECK: <Check />,
  NOT_INTERESTED: <Ban />,
  ALBUM: <Disc3 />,
  PEOPLE_GROUP: <Users />,
  SEARCH: <Search />,
  REMOVE: <Trash2 />,
  DELETE: <Trash2 />,
  FLAG: <Flag />,
  FEEDBACK: <MessageSquare />,
  HELP: <CircleHelp />,
  SETTINGS: <Settings />,
};

/** A small icon for one of YouTube's menu icon names, or nothing when we have no good match. */
export function entryIcon(name: string | null | undefined): ReactNode {
  return name ? (ICONS[name] ?? null) : null;
}

export function isDangerIcon(name: string | null | undefined): boolean {
  return name === 'REMOVE' || name === 'DELETE';
}

function Row({ entry }: { entry: ActionEntry | SubmenuEntry }) {
  return (
    <>
      {entry.icon ?? <span className="size-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      {'hint' in entry && entry.hint && <span className={menuHint}>{entry.hint}</span>}
      {'submenu' in entry && <ChevronRight className="ms-auto size-4 rtl:rotate-180" />}
    </>
  );
}

function classFor(e: ActionEntry): string {
  return e.danger ? `${menuItem} ${menuDanger}` : menuItem;
}

/** The entries of a right-click menu. */
export function ContextEntries({ entries }: { entries: readonly MenuEntry[] }) {
  return (
    <>
      {entries.map((e) => {
        if ('separator' in e)
          return <ContextMenu.Separator key={e.key} className={menuSeparator} />;
        if ('heading' in e)
          return (
            <ContextMenu.Label key={e.key} className={menuHeading}>
              {e.heading}
            </ContextMenu.Label>
          );
        if ('submenu' in e)
          return (
            <ContextMenu.Sub key={e.key}>
              <ContextMenu.SubTrigger className={menuItem}>
                <Row entry={e} />
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className={menuContent} sideOffset={6} collisionPadding={8}>
                  <ContextEntries entries={e.submenu} />
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          );
        return (
          <ContextMenu.Item
            key={e.key}
            className={classFor(e)}
            disabled={e.disabled ?? false}
            onSelect={() => void e.run()}
          >
            <Row entry={e} />
          </ContextMenu.Item>
        );
      })}
    </>
  );
}

/** The entries of a "more" dropdown. */
export function DropdownEntries({ entries }: { entries: readonly MenuEntry[] }) {
  return (
    <Fragment>
      {entries.map((e) => {
        if ('separator' in e)
          return <DropdownMenu.Separator key={e.key} className={menuSeparator} />;
        if ('heading' in e)
          return (
            <DropdownMenu.Label key={e.key} className={menuHeading}>
              {e.heading}
            </DropdownMenu.Label>
          );
        if ('submenu' in e)
          return (
            <DropdownMenu.Sub key={e.key}>
              <DropdownMenu.SubTrigger className={menuItem}>
                <Row entry={e} />
              </DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent
                  className={menuContent}
                  sideOffset={6}
                  collisionPadding={8}
                >
                  <DropdownEntries entries={e.submenu} />
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
          );
        return (
          <DropdownMenu.Item
            key={e.key}
            className={classFor(e)}
            disabled={e.disabled ?? false}
            onSelect={() => void e.run()}
          >
            <Row entry={e} />
          </DropdownMenu.Item>
        );
      })}
    </Fragment>
  );
}
