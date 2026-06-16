"use client";

import { SkeletonBlock, SkeletonRegion } from "@/components/ui/skeleton";

interface AdminTableSkeletonProps {
  /**
   * Relative widths for each column, e.g. ["22%", "14%", "1fr"]. Mirror the
   * real table's column layout so the placeholder aligns and avoids CLS.
   */
  columns: Array<string | number>;
  /** Number of placeholder rows to render. */
  rows?: number;
  label?: string;
}

/**
 * Skeleton body for an AdminTable. Renders a stack of rows whose columns match
 * the live table, so the placeholder occupies the same footprint. Pass to
 * <AdminTable loadingSkeleton={...}>.
 */
export function AdminTableSkeleton({ columns, rows = 6, label = "Loading" }: AdminTableSkeletonProps) {
  const gridTemplateColumns = columns
    .map((c) => (typeof c === "number" ? `${c}px` : c))
    .join(" ");

  return (
    <SkeletonRegion label={label} className="admin-table-skeleton">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="admin-table-skeleton-row"
          aria-hidden="true"
          style={{ gridTemplateColumns }}
        >
          {columns.map((_, colIndex) => (
            <SkeletonBlock key={colIndex} variant="text" />
          ))}
        </div>
      ))}
    </SkeletonRegion>
  );
}
