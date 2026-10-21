import {
  ArrowLeft,
  ArrowRight,
  ClipboardPaste,
  Compass,
  Copy,
  ExternalLink,
  Maximize2,
  Scissors,
  Search,
  TextSelect,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '../../i18n/index';
import { usePlayerStore } from '../../player/store';
import {
  Shell,
  exec,
  mod,
  paste,
  runCommand,
  sep,
  usePlaybackEntries,
  type Ctx,
} from '../../app/components/ContextShell';
import type { MenuEntry } from '../../app/components/menu';
import { navigateTo, useContribution, type MenuContext } from '../../core';

/**
 * Right-click anywhere in the main window: it offers what makes sense for what was clicked. Page
 * entries are assembled from what features contribute (sidebar items, `menus`), so adding or
 * removing a feature changes the menu with no edit here.
 */
export function AppContextMenu({ children }: { children: ReactNode }) {
  const t = useT();
  const track = usePlayerStore((s) => s.track);
  const playback = usePlaybackEntries();
  const nav = useContribution('nav');
  const menus = useContribution('menus');

  const go = (to: string) => () => {
    navigateTo(to);
  };
  const menuCtx: MenuContext = { hasTrack: track !== null };
  const from = (menu: 'root' | 'go' | 'view'): MenuEntry[] =>
    menus.filter((m) => m.menu === menu).flatMap((m) => m.entries(menuCtx));

  const entriesFor = (ctx: Ctx): MenuEntry[] => {
    if (ctx.kind === 'none') return [];
    if (ctx.kind === 'edit') {
      const { el, hasSelection, readOnly } = ctx;
      return [
        {
          key: 'cut',
          label: t('ctx.cut'),
          icon: <Scissors />,
          hint: `${mod()}X`,
          disabled: !hasSelection || readOnly,
          run: () => {
            el.focus();
            runCommand('cut');
          },
        },
        {
          key: 'copy',
          label: t('ctx.copy'),
          icon: <Copy />,
          hint: `${mod()}C`,
          disabled: !hasSelection,
          run: () => {
            el.focus();
            runCommand('copy');
          },
        },
        {
          key: 'paste',
          label: t('ctx.paste'),
          icon: <ClipboardPaste />,
          hint: `${mod()}V`,
          disabled: readOnly,
          run: () => paste(el),
        },
        sep('s1'),
        {
          key: 'all',
          label: t('ctx.selectAll'),
          icon: <TextSelect />,
          hint: `${mod()}A`,
          run: () => {
            el.focus();
            if ('select' in el && typeof el.select === 'function') el.select();
            else exec('selectAll');
          },
        },
      ];
    }
    if (ctx.kind === 'selection')
      return [
        {
          key: 'copy',
          label: t('ctx.copy'),
          icon: <Copy />,
          hint: `${mod()}C`,
          run: () => runCommand('copy'),
        },
        {
          key: 'search',
          label: t('ctx.searchFor', {
            text: ctx.text.length > 40 ? `${ctx.text.slice(0, 40)}…` : ctx.text,
          }),
          icon: <Search />,
          run: go(`/search?q=${encodeURIComponent(ctx.text.slice(0, 200))}`),
        },
      ];

    const entries: MenuEntry[] = [];
    if (ctx.kind === 'link')
      entries.push(
        { key: 'open', label: t('ctx.open'), icon: <ExternalLink />, run: go(ctx.href) },
        sep('s-link'),
      );
    if (playback.length > 0)
      entries.push({ key: 'h-playback', heading: t('ctx.playback') }, ...playback, sep('s-play'));

    const goEntries: MenuEntry[] = [
      ...nav
        .filter((n) => (n.placement ?? 'main') === 'main')
        .map((n) => ({
          key: `nav-${n.id}`,
          label: t(n.label),
          icon: <n.icon />,
          run: go(n.to),
        })),
      ...from('go'),
    ];
    const viewEntries = from('view');
    entries.push(
      { key: 'back', label: t('nav.back'), icon: <ArrowLeft />, run: () => navigateTo(-1) },
      { key: 'forward', label: t('nav.forward'), icon: <ArrowRight />, run: () => navigateTo(1) },
    );
    if (goEntries.length > 0)
      entries.push({ key: 'go', label: t('ctx.goTo'), icon: <Compass />, submenu: goEntries });
    if (viewEntries.length > 0)
      entries.push({
        key: 'view',
        label: t('ctx.view'),
        icon: <Maximize2 />,
        submenu: viewEntries,
      });
    const rest: MenuEntry[] = [
      ...from('root'),
      ...nav
        .filter((n) => n.placement === 'bottom')
        .map((n) => ({
          key: `nav-${n.id}`,
          label: t(n.label),
          icon: <n.icon />,
          run: go(n.to),
        })),
    ];
    if (rest.length > 0) entries.push(sep('s-end'), ...rest);
    return entries;
  };

  return <Shell entriesFor={entriesFor}>{children}</Shell>;
}
