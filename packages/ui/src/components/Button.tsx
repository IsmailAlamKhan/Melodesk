import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium select-none',
        'transition-colors duration-(--duration-fast) ease-(--ease-out)',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-accent text-accent-fg hover:brightness-110',
        variant === 'secondary' && 'bg-bg-overlay text-fg hover:bg-accent-soft hover:text-accent',
        variant === 'ghost' && 'text-fg-muted hover:bg-accent-soft hover:text-accent',
        className,
      )}
      {...props}
    />
  );
});
