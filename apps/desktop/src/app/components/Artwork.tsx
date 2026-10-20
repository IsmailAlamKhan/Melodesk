import { pickThumb, type Thumbnail } from '@melodesk/adapter';
import { cn } from '@melodesk/ui';
import { Music2 } from 'lucide-react';

export function Artwork({
  thumbnails,
  size,
  round,
  className,
  alt = '',
}: {
  thumbnails: Thumbnail[];
  size: number;
  round?: boolean | undefined;
  className?: string | undefined;
  alt?: string | undefined;
}) {
  const url = pickThumb(thumbnails, size * 2);
  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden bg-bg-overlay',
        round ? 'rounded-full' : 'rounded-md',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          draggable={false}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-fg-subtle">
          <Music2 className="size-1/3" />
        </div>
      )}
    </div>
  );
}
