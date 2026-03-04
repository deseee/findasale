import React from 'react';
import Skeleton from './Skeleton';

/**
 * SkeletonCards — Phase 25 skeleton loading states
 * Composite skeletons for SaleCard, ItemCard, and generic list views.
 * Use in place of real cards while data is loading.
 */

/** Sale card skeleton — matches SaleCard layout */
export const SaleCardSkeleton = () => (
  <div className="card overflow-hidden">
    {/* Image placeholder */}
    <Skeleton className="h-48 w-full rounded-none" />
    <div className="p-4 space-y-3">
      {/* Title */}
      <Skeleton className="h-6 w-3/4" />
      {/* Description lines */}
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      {/* Date + location row */}
      <div className="flex justify-between items-center mt-4">
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-3 w-24" />
      {/* Organizer link */}
      <Skeleton className="h-3 w-28 mt-2" />
    </div>
  </div>
);

/** Item card skeleton — matches ItemCard layout */
export const ItemCardSkeleton = () => (
  <div className="card overflow-hidden">
    {/* Image placeholder */}
    <Skeleton className="h-48 w-full rounded-none" />
    <div className="p-4 space-y-3">
      {/* Title */}
      <Skeleton className="h-5 w-2/3" />
      {/* Description */}
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      {/* Price + status row */}
      <div className="flex items-center justify-between mt-4">
        <div className="w-1/2">
          <Skeleton className="h-2 w-12 mb-1" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-5 w-16" />
      </div>
      {/* Countdown */}
      <Skeleton className="h-3 w-20 mt-2" />
    </div>
  </div>
);

/** Generic list item skeleton */
export const ListItemSkeleton = () => (
  <div className="flex items-center space-x-4 p-4 border-b border-warm-200">
    <Skeleton className="h-12 w-12 rounded-full" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  </div>
);

export default Skeleton;
