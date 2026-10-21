import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { IconButton } from '@melodesk/ui';
import { Copy, Gauge, ListPlus, Moon, MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { menuContent as menuClass, menuItem as itemClass, menuSeparator } from '../components/menu';
import { useT } from '../../i18n';
import { usePlayerStore } from '../../player/store';
import { useUiStore } from '../uiStore';
import {
  dedupeQueue,
  PLAYBACK_RATES,
  saveQueueAsPlaylist,
  setPlaybackRate,
  setSleepTimer,
} from './queueTools';

export function QueueToolsMenu() {
  const t = useT();
  const sleepUntil = useUiStore((s) => s.sleepUntil);
  const rate = usePlayerStore((s) => s.flags?.playbackRate ?? 1);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sleepUntil) return;
    const id = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, [sleepUntil]);
  const remaining = sleepUntil ? Math.max(0, Math.round((sleepUntil - now) / 60_000)) : null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton label={t('queueTools.label')} size="sm">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" className={menuClass}>
          <DropdownMenu.Item className={itemClass} onSelect={() => void dedupeQueue()}>
            <Copy className="size-4" />
            {t('queueTools.dedupe')}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemClass} onSelect={saveQueueAsPlaylist}>
            <ListPlus className="size-4" />
            {t('queueTools.saveAsPlaylist')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={menuSeparator} />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={itemClass}>
              <Moon className="size-4" />
              {t('queueTools.sleepTimer')}
              {remaining !== null && (
                <span className="ms-auto text-xs text-fg-subtle">
                  {t('queueTools.minutesLeft', { minutes: remaining })}
                </span>
              )}
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className={menuClass}>
                {[15, 30, 45, 60, 90].map((m) => (
                  <DropdownMenu.Item
                    key={m}
                    className={itemClass}
                    onSelect={() => setSleepTimer(m)}
                  >
                    {t('queueTools.minutes', { minutes: m })}
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Item
                  className={itemClass}
                  disabled={!sleepUntil}
                  onSelect={() => setSleepTimer(0)}
                >
                  {t('queueTools.off')}
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={itemClass}>
              <Gauge className="size-4" />
              {t('queueTools.speed')}
              <span className="ms-auto text-xs text-fg-subtle">
                {t('queueTools.rate', { rate })}
              </span>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className={menuClass}>
                {PLAYBACK_RATES.map((r) => (
                  <DropdownMenu.Item
                    key={r}
                    className={itemClass}
                    onSelect={() => void setPlaybackRate(r)}
                  >
                    {r === 1
                      ? t('queueTools.rateNormal', { rate: r })
                      : t('queueTools.rate', { rate: r })}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
