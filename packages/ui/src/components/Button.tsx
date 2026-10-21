import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `primary` is Material's filled button, `secondary` the tonal one, `outlined` the outlined one
   * and `ghost` the text button.
   */
  variant?: 'primary' | 'secondary' | 'outlined' | 'ghost';
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
        'state-layer m3-motion inline-flex items-center justify-center gap-2 select-none',
        'type-label-large',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:pointer-events-none disabled:opacity-50',
        // Half the height, so the corner can animate to a rounded rectangle while pressed.
        size === 'sm' ? 'h-8 rounded-[16px] px-4' : 'h-10 rounded-[20px] px-6',
        'active:rounded-[10px]',
        variant === 'primary' && 'bg-primary text-on-primary',
        variant === 'secondary' && 'bg-secondary-container text-on-secondary-container',
        variant === 'outlined' && 'border border-outline text-primary',
        variant === 'ghost' && 'px-3 text-primary',
        className,
      )}
      {...props}
    />
  );
});
