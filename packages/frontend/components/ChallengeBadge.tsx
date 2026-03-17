import React from 'react';

interface ChallengeBadgeProps {
  emoji: string;
  name: string;
  earned: boolean;
  earnedAt?: string;
  compact?: boolean;
}

/**
 * Reusable challenge badge component
 * Shows emoji + challenge name with earned/locked state
 */
export const ChallengeBadge: React.FC<ChallengeBadgeProps> = ({
  emoji,
  name,
  earned,
  earnedAt,
  compact = false,
}) => {
  if (compact) {
    return (
      <div className={`flex items-center justify-center w-16 h-16 rounded-full border-2 ${
        earned
          ? 'bg-sage-green/10 border-sage-green shadow-sm'
          : 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-600 opacity-50'
      }`}>
        <span className="text-2xl">{emoji}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center p-6 rounded-lg border-2 transition-all ${
      earned
        ? 'bg-sage-green/5 border-sage-green shadow-md'
        : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700 opacity-60'
    }`}>
      <div className="relative">
        <span className="text-5xl">{emoji}</span>
        {earned && (
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-sage-green rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">✓</span>
          </div>
        )}
      </div>

      <h3 className="mt-4 font-semibold text-center text-gray-900 dark:text-white">
        {name}
      </h3>

      {earned && earnedAt && (
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          Earned {new Date(earnedAt).toLocaleDateString()}
        </p>
      )}

      {earned && (
        <div className="mt-3 px-3 py-1 bg-sage-green text-white text-xs font-semibold rounded-full">
          EARNED
        </div>
      )}

      {!earned && (
        <div className="mt-3 px-3 py-1 bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-200 text-xs font-semibold rounded-full">
          LOCKED
        </div>
      )}
    </div>
  );
};
