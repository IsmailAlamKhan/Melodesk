import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon buttons have no visible text. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'solid';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, label, size = 'md', variant = 'ghost', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full select-none',
        'transition-colors duration-(--duration-fast) ease-(--ease-out)',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' && 'size-8 [&>svg]:size-4',
        size === 'md' && 'size-10 [&>svg]:size-5',
        size === 'lg' && 'size-12 [&>svg]:size-6',
        variant === 'ghost' && 'text-fg-muted hover:bg-bg-overlay hover:text-fg',
        variant === 'solid' && 'bg-fg text-bg hover:brightness-90',
        className,
      )}
      {...props}
    />
  );
});
