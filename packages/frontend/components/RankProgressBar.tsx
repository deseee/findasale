import React from 'react';
import { ExplorerRank } from './RankBadge';

interface RankProgressBarProps {
  currentXp: number;
  nextRankXp: number;
  currentRank: ExplorerRank;
  nextRank: ExplorerRank | null; // null if at GRANDMASTER
}

const RANK_COLORS: Record<ExplorerRank, { barColor: string; darkBarColor: string }> = {
  INITIATE: { barColor: 'from-blue-400 to-blue-600', darkBarColor: 'dark:from-blue-500 dark:to-blue-700' },
  SCOUT: { barColor: 'from-purple-400 to-purple-600', darkBarColor: 'dark:from-purple-500 dark:to-purple-700' },
  RANGER: { barColor: 'from-green-400 to-green-600', darkBarColor: 'dark:from-green-500 dark:to-green-700' },
  SAGE: { barColor: 'from-amber-400 to-amber-600', darkBarColor: 'dark:from-amber-500 dark:to-amber-700' },
  GRANDMASTER: { barColor: 'from-red-400 to-red-600', darkBarColor: 'dark:from-red-500 dark:to-red-700' },
};

export const RankProgressBar: React.FC<RankProgressBarProps> = ({
  currentXp,
  nextRankXp,
  currentRank,
  nextRank,
}) => {
  const progressPercent = Math.min((currentXp / nextRankXp) * 100, 100);
  const isMaxRank = nextRank === null;
  const rankColor = RANK_COLORS[currentRank];

  return (
    <div className="w-full">
      {/* Header with labels */}
      <div className="flex justify-between items-center mb-2">
        <div>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            {isMaxRank ? 'MAX RANK' : `Progress to ${nextRank}`}
          </span>
        </div>
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
          {currentXp.toLocaleString()} / {nextRankXp.toLocaleString()} XP
        </span>
      </div>

      {/* Progress bar container */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden shadow-sm">
        {/* Animated fill */}
        <div
          className={`h-full bg-gradient-to-r ${rankColor.barColor} ${rankColor.darkBarColor} transition-all duration-500 ease-out`}
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-valuenow={Math.round(progressPercent)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Percentage display */}
      <div className="mt-1 text-right">
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {Math.round(progressPercent)}%
        </span>
      </div>
    </div>
  );
};

export default RankProgressBar;
