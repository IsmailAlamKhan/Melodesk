import { Skeleton } from '@melodesk/ui';

export function ShelfSkeleton({ tiles = 6 }: { tiles?: number }) {
  return (
    <div className="flex flex-col gap-3 px-2">
      <Skeleton className="h-6 w-48" />
      <div className="flex gap-3">
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="size-42 rounded-md" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2 px-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-8 p-4">
      <ShelfSkeleton />
      <ShelfSkeleton />
      <ShelfSkeleton />
    </div>
  );
}
