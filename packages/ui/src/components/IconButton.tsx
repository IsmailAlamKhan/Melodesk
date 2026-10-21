import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../cn';
import { Tooltip } from './Tooltip';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon buttons have no visible text. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  /**
   * `ghost` is Material's standard icon button, `tonal` and `solid` its tonal and filled ones.
   * A button with `aria-pressed` is a toggle: it turns into a tonal rounded square while on.
   */
  variant?: 'ghost' | 'tonal' | 'solid';
  /** Round (default) or the squircle Expressive uses for prominent buttons such as Play. */
  shape?: 'round' | 'squircle';
}

// Radii are real numbers (half the height), not 9999px, so the corner can animate between shapes.
const ROUND = { sm: 'rounded-[16px]', md: 'rounded-[20px]', lg: 'rounded-[24px]' } as const;
const SQUIRCLE = { sm: 'rounded-[11px]', md: 'rounded-[14px]', lg: 'rounded-[16px]' } as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, label, size = 'md', variant = 'ghost', shape = 'round', type = 'button', ...props },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        'state-layer m3-motion inline-flex shrink-0 items-center justify-center select-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' && 'size-8 [&>svg]:size-[18px]',
        size === 'md' && 'size-10 [&>svg]:size-6',
        size === 'lg' && 'size-12 [&>svg]:size-6',
        shape === 'round' ? ROUND[size] : SQUIRCLE[size],
        variant === 'ghost' &&
          'text-on-surface-variant aria-pressed:rounded-[12px] aria-pressed:bg-secondary-container aria-pressed:text-on-secondary-container',
        variant === 'tonal' && 'bg-secondary-container text-on-secondary-container',
        variant === 'solid' && 'bg-primary text-on-primary',
        'active:rounded-[10px]',
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
