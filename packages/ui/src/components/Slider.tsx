import * as RadixSlider from '@radix-ui/react-slider';
import { cn } from '../cn';
import { Tooltip } from './Tooltip';

export interface SliderProps {
  label: string;
  /** Shown after the label in the tooltip, e.g. "50%" or "1:02". */
  valueLabel?: (value: number) => string;
  value: number;
  max: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  onChange?: (value: number) => void;
  /** Fired when the user releases the thumb; use for seek so we don't spam the bridge. */
  onCommit?: (value: number) => void;
}

export function Slider({
  label,
  valueLabel,
  value,
  max,
  step = 1,
  disabled,
  className,
  onChange,
  onCommit,
}: SliderProps) {
  return (
    <Tooltip label={valueLabel ? `${label} · ${valueLabel(value)}` : label}>
      <RadixSlider.Root
        data-slider-root=""
        dir="ltr"
        className={cn(
          'group relative flex h-7 w-full touch-none items-center select-none',
          className,
        )}
        value={[Math.min(value, max)]}
        max={Math.max(max, step)}
        step={step}
        disabled={disabled}
        onValueChange={(v) => {
          if (v[0] !== undefined) onChange?.(v[0]);
        }}
        onValueCommit={(v) => {
          if (v[0] !== undefined) onCommit?.(v[0]);
        }}
      >
        <RadixSlider.Track className="relative h-2 grow rounded-full bg-outline-variant">
          <RadixSlider.Range className="absolute h-full rounded-full bg-primary" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-label={label}
          className={cn(
            // Expressive handle: a tall bar that thins while pressed.
            'block h-7 w-1 rounded-full bg-primary shadow transition-[width] duration-(--duration-fast)',
            'active:w-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          )}
        />
      </RadixSlider.Root>
    </Tooltip>
  );
}
