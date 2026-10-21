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
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-scrim/40 backdrop-blur-sm" />
        <RadixDialog.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-[28px] bg-surface-container-high p-6 shadow-2xl',
            'focus:outline-none',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <RadixDialog.Title className="type-headline-small font-display">
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="type-body-medium mt-2 text-on-surface-variant">
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
  'type-body-large h-12 w-full rounded-md border border-outline bg-transparent px-4 text-on-surface placeholder:text-on-surface-subtle hover:border-on-surface focus-visible:border-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary';
