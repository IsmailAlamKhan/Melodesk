import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../cn';
import { IconButton } from './IconButton';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
  /** Accessible label of the close button (defaults to English). */
  closeLabel?: string | undefined;
}

/** Modal dialog with platform-neutral styling, focus trap and Escape handling from Radix. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  closeLabel,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <RadixDialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl bg-bg-elevated p-6 shadow-2xl ring-1 ring-border/60',
            'focus:outline-none',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <RadixDialog.Title className="font-display text-xl font-bold tracking-tight">
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-1 text-sm text-fg-muted">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <IconButton label={closeLabel ?? 'Close'} size="sm">
                <X />
              </IconButton>
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const inputClass =
  'h-11 w-full rounded-xl border border-transparent bg-bg-overlay px-4 text-sm text-fg placeholder:text-fg-subtle transition-colors focus-visible:border-accent focus-visible:bg-bg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft';
