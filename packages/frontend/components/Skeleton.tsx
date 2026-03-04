import React from 'react';

interface SkeletonProps {
  className?: string;
}

/**
 * Animated pulse skeleton placeholder. Pass a `className` to control
 * size/shape — e.g. `className="h-48 w-full"` for a card image slot.
 */
const Skeleton = ({ className = '' }: SkeletonProps) => (
  <div className={`animate-pulse bg-warm-200 rounded ${className}`} aria-hidden="true" />
);

export default Skeleton;
