import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';
import { Tooltip } from './Tooltip';

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
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full select-none',
        'transition-colors duration-(--duration-fast) ease-(--ease-out)',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' && 'size-8 [&>svg]:size-4',
        size === 'md' && 'size-10 [&>svg]:size-5',
        size === 'lg' && 'size-12 [&>svg]:size-6',
        variant === 'ghost' && 'text-fg-muted hover:bg-accent-soft hover:text-accent',
        variant === 'solid' && 'bg-accent text-accent-fg hover:brightness-110',
        className,
      )}
      {...props}
    />
  );
  // A disabled button gets no pointer events, so its tooltip hangs off a wrapper instead.
  return props.disabled ? (
    <Tooltip label={label}>
      <span className="inline-flex shrink-0 rounded-full">{button}</span>
    </Tooltip>
  ) : (
    <Tooltip label={label}>{button}</Tooltip>
  );
});
