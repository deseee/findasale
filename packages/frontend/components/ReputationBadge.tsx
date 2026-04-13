import React from 'react';

interface ReputationBadgeProps {
  score: number;                          // 0–5 stars
  isNew?: boolean;                        // show "New Organizer" badge
  size?: 'small' | 'large' | 'medium';   // sizing variant
  showCount?: boolean;                    // show sale count alongside stars
  saleCount?: number;
}

/**
 * Feature #71: Reputation Badge Component
 *
 * Displays 1–5 stars (float, supports 0.5 increments) + "New Organizer" badge
 * Colors: sage-green for established, warm-gray for new
 */
const ReputationBadge: React.FC<ReputationBadgeProps> = ({
  score,
  isNew = false,
  size = 'medium',
  showCount = false,
  saleCount = 0,
}) => {
  // Clamp score 0–5
  const normalizedScore = Math.min(Math.max(score, 0), 5);

  // Determine sizing
  const sizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
  };
  const starSize = {
    small: 'w-3 h-3',
    medium: 'w-4 h-4',
    large: 'w-5 h-5',
  };

  // Render star (★) — full, half, or empty
  const renderStar = (idx: number) => {
    const threshold = idx + 1;
    if (normalizedScore >= threshold) {
      // Full star
      return (
        <span key={idx} className={`${starSize[size]} inline-block text-amber-500`}>
          ★
        </span>
      );
    } else if (normalizedScore > idx && normalizedScore < threshold) {
      // Half star (use SVG or text overlay approximation)
      return (
        <span key={idx} className={`${starSize[size]} inline-block relative text-gray-300 dark:text-gray-600`}>
          ★
          <span className="absolute left-0 top-0 overflow-hidden" style={{ width: '50%' }}>
            <span className="text-amber-500">★</span>
          </span>
        </span>
      );
    } else {
      // Empty star
      return (
        <span key={idx} className={`${starSize[size]} inline-block text-gray-300 dark:text-gray-600`}>
          ★
        </span>
      );
    }
  };

  const stars = Array.from({ length: 5 }, (_, i) => renderStar(i));

  if (isNew) {
    // New organizer badge variant
    return (
      <div className={`inline-flex items-center gap-2 ${sizeClasses[size]} font-medium`}>
        <div className="inline-flex gap-0.5">
          {stars}
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-warm-100 dark:bg-warm-900 text-warm-700 dark:text-warm-200 whitespace-nowrap">
          New Organizer ({saleCount} sale{saleCount !== 1 ? 's' : ''} so far)
        </span>
      </div>
    );
  }

  // Established organizer badge
  return (
    <div className={`inline-flex items-center gap-1 ${sizeClasses[size]} font-medium`}>
      <div className="inline-flex gap-0.5">
        {stars}
      </div>
      <span className="text-xs text-warm-600 dark:text-warm-400">
        {normalizedScore.toFixed(1)}
      </span>
      {showCount && saleCount > 0 && (
        <span className="text-xs text-warm-500 dark:text-warm-500">
          ({saleCount} sales)
        </span>
      )}
    </div>
  );
};

export default ReputationBadge;
