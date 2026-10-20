import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { IconButton } from '@melodesk/ui';
import { Copy, Gauge, ListPlus, Moon, MoreHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePlayerStore } from '../../player/store';
import { useUiStore } from '../uiStore';
import {
  dedupeQueue,
  PLAYBACK_RATES,
  saveQueueAsPlaylist,
  setPlaybackRate,
  setSleepTimer,
} from './queueTools';

const menuClass =
  'z-50 min-w-52 rounded-lg border border-border bg-bg-elevated p-1 text-sm shadow-xl';
const itemClass =
  'flex cursor-default select-none items-center gap-3 rounded-md px-3 py-2 outline-none data-[highlighted]:bg-bg-overlay data-[disabled]:opacity-50';

export function QueueToolsMenu() {
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
        <IconButton label="Queue tools" size="sm">
          <MoreHorizontal />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" className={menuClass}>
          <DropdownMenu.Item className={itemClass} onSelect={() => void dedupeQueue()}>
            <Copy className="size-4" />
            Remove duplicates
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemClass} onSelect={saveQueueAsPlaylist}>
            <ListPlus className="size-4" />
            Save queue as playlist
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={itemClass}>
              <Moon className="size-4" />
              Sleep timer
              {remaining !== null && (
                <span className="ms-auto text-xs text-fg-subtle">{String(remaining)} min</span>
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
                    {String(m)} minutes
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Item
                  className={itemClass}
                  disabled={!sleepUntil}
                  onSelect={() => setSleepTimer(0)}
                >
                  Off
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={itemClass}>
              <Gauge className="size-4" />
              Speed
              <span className="ms-auto text-xs text-fg-subtle">{String(rate)}×</span>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className={menuClass}>
                {PLAYBACK_RATES.map((r) => (
                  <DropdownMenu.Item
                    key={r}
                    className={itemClass}
                    onSelect={() => void setPlaybackRate(r)}
                  >
                    {String(r)}×{r === 1 ? ' (normal)' : ''}
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
