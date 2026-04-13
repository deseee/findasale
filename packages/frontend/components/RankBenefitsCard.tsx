import React from 'react';
import { ExplorerRank } from './RankBadge';
import { Check } from 'lucide-react';

interface RankBenefitsCardProps {
  rank: ExplorerRank;
  compact?: boolean;
}

const RANK_BENEFITS: Record<ExplorerRank, string[]> = {
  INITIATE: [
    '30 min holds',
    '1 concurrent hold',
    '1 wishlist save',
    'Home feed access',
  ],
  SCOUT: [
    '45 min holds',
    'Scout Reveal (5 XP)',
    'Haul Unboxing (2 XP)',
    'Bump Post (10 XP)',
    '3 wishlist saves',
    'Early sale announcements (1h before)',
  ],
  RANGER: [
    '60 min holds',
    '2 concurrent holds',
    'Legendary early access (2h)',
    '10 wishlist saves',
    'Skip hold confirmation once per sale',
    'Collector tier badges',
  ],
  SAGE: [
    '75 min holds',
    '3 concurrent holds',
    'Legendary early access (4h)',
    '15 wishlist saves',
    'Leaderboard rank visibility',
    'Profile colors + frame badges',
    'Hall of Fame eligibility',
  ],
  GRANDMASTER: [
    '90 min holds',
    'Auto-confirm all holds',
    'Legendary early access (6h)',
    'Unlimited wishlist saves',
    'All cosmetics free',
    'Permanent Hall of Fame entry',
    '👑 Grandmaster seal',
  ],
};

const RANK_ORDER: ExplorerRank[] = ['INITIATE', 'SCOUT', 'RANGER', 'SAGE', 'GRANDMASTER'];

const RANK_LABELS: Record<ExplorerRank, string> = {
  INITIATE: 'Initiate',
  SCOUT: 'Scout',
  RANGER: 'Ranger',
  SAGE: 'Sage',
  GRANDMASTER: 'Grandmaster',
};

export const RankBenefitsCard: React.FC<RankBenefitsCardProps> = ({
  rank,
  compact = false,
}) => {
  const benefits = RANK_BENEFITS[rank];
  const currentRankIndex = RANK_ORDER.indexOf(rank);
  const nextRank = currentRankIndex < RANK_ORDER.length - 1 ? RANK_ORDER[currentRankIndex + 1] : null;
  const nextRankBenefits = nextRank ? RANK_BENEFITS[nextRank].slice(0, 3) : [];

  if (compact) {
    const displayedBenefits = benefits.slice(0, 3);
    const moreCount = benefits.length - 3;

    return (
      <div className="flex flex-wrap gap-2 items-center">
        {displayedBenefits.map((benefit, idx) => (
          <span
            key={idx}
            className="inline-block px-2.5 py-1 text-xs font-medium bg-sage-100 text-sage-700 dark:bg-sage-900/30 dark:text-sage-300 rounded-full"
          >
            {benefit}
          </span>
        ))}
        {moreCount > 0 && (
          <button
            className="inline-block px-2.5 py-1 text-xs font-medium bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            title={`+${moreCount} more benefits`}
          >
            +{moreCount} more
          </button>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100">
          {RANK_LABELS[rank]} Unlocks
        </h3>
      </div>

      {/* Benefits List */}
      <div className="space-y-2 mb-4">
        {benefits.map((benefit, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <Check size={16} className="text-sage-600 dark:text-sage-400 mt-0.5 flex-shrink-0" />
            <span className="text-sm text-gray-700 dark:text-gray-300">{benefit}</span>
          </div>
        ))}
      </div>

      {/* Next Rank Preview */}
      {nextRank && (
        <div className="border-t border-warm-200 dark:border-gray-700 pt-3 mt-3">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
            Next rank ({RANK_LABELS[nextRank]}) unlocks:
          </p>
          <div className="space-y-1">
            {nextRankBenefits.map((benefit, idx) => (
              <p key={idx} className="text-xs text-gray-500 dark:text-gray-400">
                • {benefit}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RankBenefitsCard;
