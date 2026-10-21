import * as Dialog from '@radix-ui/react-dialog';
import { IconButton } from '@melodesk/ui';
import { X } from 'lucide-react';
import { create } from 'zustand';
import { useT } from '../../i18n/index';
import { shortcutGroups } from './keys';

export const useCheatsheet = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

const mod = (): string =>
  document.documentElement.dataset['platform'] === 'macos' ? '⌘' : 'Ctrl+';

/** The keys the app understands, one press away with "?". */
export function Cheatsheet() {
  const t = useT();
  const open = useCheatsheet((s) => s.open);
  const setOpen = useCheatsheet((s) => s.setOpen);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          // Focus the sheet itself, not its Close button: a focused button shows its tooltip, and
          // Escape then closes the tooltip first and the sheet only on the second press.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          className="fixed top-[12vh] left-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] max-h-[76vh] -translate-x-1/2 overflow-y-auto rounded-2xl border border-border bg-bg-elevated p-5 shadow-2xl focus:outline-none"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="font-display text-xl font-semibold">
              {t('keys.title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label={t('common.close')} size="sm">
                <X />
              </IconButton>
            </Dialog.Close>
          </div>
          <div className="mt-4 flex flex-col gap-5">
            {shortcutGroups(mod()).map((g) => (
              <section key={g.title}>
                <h2 className="mb-1 text-xs font-medium tracking-wide text-fg-subtle uppercase">
                  {t(g.title)}
                </h2>
                <dl>
                  {g.rows.map((r) => (
                    <div
                      key={r.label}
                      className="flex items-center justify-between gap-4 border-b border-border/40 py-2 text-sm last:border-0"
                    >
                      <dt>{t(r.label)}</dt>
                      <dd className="flex gap-1">
                        {r.keys.map((k) => (
                          <kbd
                            key={k}
                            className="min-w-6 rounded-md border border-border bg-bg px-1.5 py-0.5 text-center font-mono text-xs"
                          >
                            {k}
                          </kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <p className="mt-4 text-xs text-fg-subtle">{t('keys.note')}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
