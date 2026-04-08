/**
 * BoostBadge — renders a "Featured" / "Trending" / "Hot Bounty" badge
 * based on the boost type attached to a sale, haul, or bounty.
 * Phase 2b: Used in SaleMapInner, SaleCard, haul feed, bounty list.
 */

import React from 'react';

type BoostType =
  | 'SALE_BUMP'
  | 'HAUL_VISIBILITY'
  | 'BOUNTY_VISIBILITY'
  | 'EVENT_SPONSORSHIP'
  | 'WISHLIST_NOTIFICATION'
  | 'SEASONAL_CHALLENGE_ACCESS'
  | 'GUIDE_PUBLICATION'
  | 'RARITY_BOOST';

interface BoostBadgeProps {
  boostType: BoostType | string;
  size?: 'sm' | 'md';
  className?: string;
}

const BOOST_BADGE_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  SALE_BUMP: {
    label: 'Featured',
    emoji: '⭐',
    color: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
  },
  HAUL_VISIBILITY: {
    label: 'Trending',
    emoji: '🔥',
    color: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700',
  },
  BOUNTY_VISIBILITY: {
    label: 'Hot Bounty',
    emoji: '🎯',
    color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700',
  },
  EVENT_SPONSORSHIP: {
    label: 'Sponsored',
    emoji: '🏆',
    color: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700',
  },
  RARITY_BOOST: {
    label: 'Boosted',
    emoji: '✨',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700',
  },
};

export default function BoostBadge({ boostType, size = 'sm', className = '' }: BoostBadgeProps) {
  const config = BOOST_BADGE_CONFIG[boostType];
  if (!config) return null;

  const sizeClasses = size === 'sm'
    ? 'text-xs px-1.5 py-0.5'
    : 'text-sm px-2 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${sizeClasses} ${config.color} ${className}`}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </span>
  );
}
