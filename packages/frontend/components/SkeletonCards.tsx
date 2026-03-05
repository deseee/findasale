import React from 'react';
import Skeleton from './Skeleton';

/**
 * SkeletonCards — Phase 25 skeleton loading states
 * Composite skeletons for SaleCard, ItemCard, and generic list views.
 * Use in place of real cards while data is loading.
 */

/** Sale card skeleton — matches Phase 26 SaleCard layout (1:1 square image + compact content) */
export const SaleCardSkeleton = () => (
  <div className="card overflow-hidden flex flex-col">
    {/* Square image placeholder */}
    <Skeleton className="aspect-square w-full rounded-none" />
    <div className="p-3 space-y-2 flex flex-col flex-1">
      {/* Title */}
      <Skeleton className="h-4 w-3/4" />
      {/* Date + city */}
      <Skeleton className="h-3 w-1/2" />
      {/* Organizer link */}
      <Skeleton className="h-3 w-2/5 mt-1" />
    </div>
  </div>
);

/** Item card skeleton — matches Phase 26 ItemCard layout (1:1 square image + compact content) */
export const ItemCardSkeleton = () => (
  <div className="card overflow-hidden flex flex-col">
    {/* Square image placeholder */}
    <Skeleton className="aspect-square w-full rounded-none" />
    <div className="p-3 space-y-2 flex flex-col flex-1">
      {/* Title */}
      <Skeleton className="h-4 w-3/4" />
      {/* Price + countdown row */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  </div>
);

/** Dashboard stat card skeleton */
export const StatCardSkeleton = () => (
  <div className="card p-6 space-y-3">
    <Skeleton className="h-4 w-24" />
    <Skeleton className="h-8 w-16" />
    <Skeleton className="h-3 w-32" />
  </div>
);

/** Table row skeleton — for dashboard tables */
export const TableRowSkeleton = () => (
  <div className="flex items-center py-4 space-x-4">
    <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/3" />
    </div>
    <Skeleton className="h-6 w-16 rounded" />
  </div>
);

/** Generic grid of skeleton cards */
interface SkeletonGridProps {
  count?: number;
  variant?: 'sale' | 'item' | 'stat';
  columns?: string;
}

export const SkeletonGrid = ({
  count = 6,
  variant = 'sale',
  columns = 'grid-cols-2 lg:grid-cols-3',
}: SkeletonGridProps) => {
  const Card = variant === 'item'
    ? ItemCardSkeleton
    : variant === 'stat'
      ? StatCardSkeleton
      : SaleCardSkeleton;

  return (
    <div className={`grid ${columns} gap-4`}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} />
      ))}
    </div>
  );
};

/** Table skeleton — for dashboard list views */
export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="card divide-y divide-warm-200">
    {Array.from({ length: rows }, (_, i) => (
      <TableRowSkeleton key={i} />
    ))}
  </div>
);

export default {
  SaleCardSkeleton,
  ItemCardSkeleton,
  StatCardSkeleton,
  TableRowSkeleton,
  SkeletonGrid,
  TableSkeleton,
};
