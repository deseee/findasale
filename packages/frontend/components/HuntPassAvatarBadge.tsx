'use client';

import React from 'react';
import { Trophy } from 'lucide-react';

interface HuntPassAvatarBadgeProps {
  /**
   * Whether the Hunt Pass is active.
   * If false, the badge is not rendered.
   */
  isActive: boolean;

  /**
   * Size of the avatar in pixels.
   * The badge is positioned absolutely, sized proportionally.
   */
  size?: number;

  /**
   * Badge position: 'bottom-right' (default) or 'top-right'
   */
  position?: 'bottom-right' | 'top-right';

  /**
   * Optional CSS class name for styling
   */
  className?: string;
}

/**
 * Hunt Pass Avatar Badge
 *
 * Golden trophy frame/ring that appears on avatars for Hunt Pass subscribers.
 * This is a visual cosmetic indicator of Hunt Pass status.
 *
 * Usage:
 * <div style={{ position: 'relative', display: 'inline-block' }}>
 *   <AvatarCircle />
 *   <HuntPassAvatarBadge isActive={user.huntPassActive} size={32} />
 * </div>
 */
const HuntPassAvatarBadge: React.FC<HuntPassAvatarBadgeProps> = ({
  isActive,
  size = 32,
  position = 'bottom-right',
  className = '',
}) => {
  if (!isActive) {
    return null;
  }

  // Badge size is proportional to avatar size (approximately 30-35% of avatar)
  const badgeSize = Math.round(size * 0.32);

  // Position offsets to align the badge corner with avatar corner
  const positionClasses = {
    'bottom-right': '-bottom-1 -right-1',
    'top-right': '-top-1 -right-1',
  }[position];

  return (
    <div
      className={`absolute ${positionClasses} flex items-center justify-center ${className}`}
      style={{
        width: `${badgeSize}px`,
        height: `${badgeSize}px`,
      }}
      aria-label="Hunt Pass Active"
      title="Hunt Pass subscriber — 2x XP and exclusive benefits"
    >
      {/* Golden ring background */}
      <div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 dark:from-amber-500 dark:via-yellow-500 dark:to-amber-600 shadow-lg"
        style={{
          boxShadow: '0 0 8px rgba(245, 158, 11, 0.8), inset -1px -1px 3px rgba(0, 0, 0, 0.2)',
        }}
      />

      {/* Inner highlight for depth */}
      <div
        className="absolute inset-1 rounded-full bg-gradient-to-b from-yellow-300 to-amber-400 dark:from-yellow-400 dark:to-amber-500 opacity-60"
      />

      {/* Trophy icon center */}
      <Trophy
        size={Math.round(badgeSize * 0.65)}
        className="relative z-10 text-white dark:text-gray-900 drop-shadow-sm"
        fill="currentColor"
      />
    </div>
  );
};

export default HuntPassAvatarBadge;
