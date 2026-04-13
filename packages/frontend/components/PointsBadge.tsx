import React from 'react';

interface PointsBadgeProps {
  points: number;
  className?: string;
}

/**
 * PointsBadge — Phase 19: displays the user's current point total.
 * Small amber badge used in BottomTabNav (profile tab) and profile page.
 */
const PointsBadge = ({ points, className = '' }: PointsBadgeProps) => {
  if (points <= 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none ${className}`}
      aria-label={`${points} points`}
    >
      🏆 {points}
    </span>
  );
};

export default PointsBadge;
