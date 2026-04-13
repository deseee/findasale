/**
 * TrailCard — Reusable card for trail discovery
 *
 * Shows trail name, stop count, XP, featured badge, completion count,
 * and user's completion status with dark mode support.
 */

import React from 'react';
import Link from 'next/link';

interface TrailCardProps {
  trail: {
    id: string;
    name: string;
    description?: string;
    stops: Array<{ id: string }>;
    estimatedXp?: number;
    isFeatured?: boolean;
    heroImageUrl?: string;
    completionCount?: number;
    type?: string;
  };
  userCompleted?: boolean;
}

const TrailCard: React.FC<TrailCardProps> = ({ trail, userCompleted = false }) => {
  const stopCount = trail.stops?.length || 0;
  const estimatedXp = trail.estimatedXp || (stopCount * 3) + 5; // 3 XP per stop + 5 completion bonus (approximation)

  return (
    <Link href={`/trails/${trail.id}`}>
      <div className="rounded-xl shadow-sm border border-warm-200 dark:border-gray-700 overflow-hidden hover:shadow-md dark:hover:shadow-lg dark:shadow-black/20 transition-shadow cursor-pointer bg-white dark:bg-gray-800 h-full flex flex-col">
        {/* Hero image or gradient placeholder */}
        <div className="relative w-full aspect-square bg-gradient-to-br from-amber-100 via-orange-50 to-amber-50 dark:from-amber-900 dark:via-orange-900 dark:to-amber-900 flex items-center justify-center overflow-hidden">
          {trail.heroImageUrl ? (
            <img
              src={trail.heroImageUrl}
              alt={trail.name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="text-4xl">🗺️</div>
          )}

          {/* Featured badge */}
          {trail.isFeatured && (
            <div className="absolute top-2 right-2 bg-yellow-500 text-white px-2.5 py-1 rounded-full text-xs font-semibold shadow-md">
              ⭐ Featured
            </div>
          )}

          {/* Completed badge */}
          {userCompleted && (
            <div className="absolute top-2 left-2 bg-green-600 text-white px-2.5 py-1 rounded-full text-xs font-semibold shadow-md flex items-center gap-1">
              ✓ Completed
            </div>
          )}
        </div>

        {/* Card content */}
        <div className="flex-1 p-4 flex flex-col gap-3">
          {/* Title */}
          <h3 className="font-bold text-lg text-warm-900 dark:text-warm-100 line-clamp-2">
            {trail.name}
          </h3>

          {/* Description (if present) */}
          {trail.description && (
            <p className="text-sm text-warm-600 dark:text-warm-400 line-clamp-2">
              {trail.description}
            </p>
          )}

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-2 text-sm border-t border-warm-100 dark:border-gray-700 pt-3 mt-auto">
            <div className="flex items-center gap-1 text-warm-700 dark:text-warm-300">
              <span>📍</span>
              <span>
                {stopCount} stop{stopCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-1 text-warm-700 dark:text-warm-300">
              <span>⭐</span>
              <span>+{estimatedXp} XP</span>
            </div>
          </div>

          {/* Completion count (if available) */}
          {trail.completionCount !== undefined && trail.completionCount > 0 && (
            <div className="text-xs text-warm-500 dark:text-warm-400">
              {trail.completionCount} completed
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

export default TrailCard;
