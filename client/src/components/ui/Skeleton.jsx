import clsx from "clsx";

/** Grey placeholder block; the shimmer stops for reduced motion. */
export function Skeleton({ className }) {
  return <div className={clsx("skeleton rounded", className)} />;
}

/** Card-shaped placeholders for lists while they load. */
export function ListSkeleton({ rows = 4, label = "Loading…" }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card space-y-2.5" style={{ opacity: 1 - i * 0.15 }}>
          <div className="flex gap-3">
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 flex-1" />
          </div>
          <Skeleton className="h-3 w-2/3" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
