import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

/**
 * Mount once near the root. Tooltips appear after a short hover (or on keyboard focus), and moving
 * between neighbouring controls shows the next one straight away. The native `title` attribute is
 * not used: embedded webviews do not reliably show it.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={350} skipDelayDuration={300} disableHoverableContent>
      {children}
    </RadixTooltip.Provider>
  );
}

export interface TooltipProps {
  /** What the control does. An empty label renders no tooltip. */
  label: ReactNode;
  /** The control. It must accept a ref and DOM props (a button, link, div…). */
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function Tooltip({ label, children, side = 'top' }: TooltipProps) {
  if (label === '' || label === null || label === undefined || label === false) return children;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="pointer-events-none z-[100] max-w-xs rounded-md border border-border bg-bg-elevated px-2 py-1 text-xs text-fg shadow-lg"
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
