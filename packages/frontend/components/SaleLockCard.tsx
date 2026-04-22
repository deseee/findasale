/**
 * Sale Lock Card — Display when a user lacks early access to a sale
 * Shows unlock time, user's current rank, and CTA to rank up
 */

import React from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { RankBadge, ExplorerRank } from './RankBadge';
import { formatUnlockTime } from '../lib/rankEarlyAccess';

interface SaleLockCardProps {
  saleTitle: string;
  saleCity: string;
  minutesUntilUnlock: number;
  userRank?: ExplorerRank;
  showRankUpCta?: boolean; // Show CTA for Initiate users
  organizerName: string;
  photoUrl?: string;
}

const SaleLockCard: React.FC<SaleLockCardProps> = ({
  saleTitle,
  saleCity,
  minutesUntilUnlock,
  userRank = 'INITIATE',
  showRankUpCta = false,
  organizerName,
  photoUrl,
}) => {
  const unlockTimeFormatted = formatUnlockTime(minutesUntilUnlock);

  return (
    <div className="w-full">
      {/* Hero image area */}
      {photoUrl && (
        <div className="relative aspect-video w-full bg-warm-200 dark:bg-gray-700 overflow-hidden rounded-lg mb-6">
          <img
            src={photoUrl}
            alt={saleTitle}
            className="w-full h-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>
      )}

      {/* Lock card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-8 text-center">
        {/* Lock icon */}
        <div className="mb-6 flex justify-center">
          <div className="bg-warm-100 dark:bg-gray-700 rounded-full p-4">
            <Lock className="w-8 h-8 text-warm-700 dark:text-warm-300" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {saleTitle}
        </h1>

        {/* Location */}
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
          {saleCity} • {organizerName}
        </p>

        {/* Unlock time */}
        <div className="bg-warm-50 dark:bg-gray-700 rounded-lg p-6 mb-8">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Unlocks in</p>
          <p className="text-4xl font-bold text-warm-700 dark:text-warm-300">
            {unlockTimeFormatted}
          </p>
        </div>

        {/* Rank info */}
        <div className="mb-8">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Your rank</p>
          <div className="flex justify-center">
            <RankBadge rank={userRank} size="lg" />
          </div>
        </div>

        {/* Rank up CTA (for Initiates) */}
        {showRankUpCta && userRank === 'INITIATE' && (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 mb-6 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-200 mb-4">
              Rank up to access sales early and unlock exclusive features
            </p>
            <Link
              href="/shopper/guild-primer"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Learn How to Rank Up
            </Link>
          </div>
        )}

        {/* Coming soon message */}
        <p className="text-gray-600 dark:text-gray-400">
          This sale will be available to all shoppers at the time shown above.
        </p>
      </div>
    </div>
  );
};

export default SaleLockCard;
