import React, { useState } from 'react';
import { CheckCircle, Lock, TrendingUp, Users, BarChart3, Globe, ChevronDown, ChevronUp } from 'lucide-react';

interface PosTierGatesProps {
  tier: 0 | 1 | 2 | 3;
  transactionCount: number;
  totalRevenue: number;
  nextGate?: {
    tier: 1 | 2 | 3;
    txNeeded: number;
    revenueNeeded: number;
  };
}

const TIER_CONFIG = {
  1: {
    name: 'Item Performance Snapshot',
    description: 'Which items sold fastest, which sat',
    icon: TrendingUp,
    unlockCriteria: '5 transactions + $50 revenue',
    minTx: 5,
    minRevenue: 50,
  },
  2: {
    name: 'Category Deep Dive + Repeat Buyer Map',
    description: 'Identify patterns and customer trends',
    icon: Users,
    unlockCriteria: '20 transactions + $300 revenue',
    minTx: 20,
    minRevenue: 300,
  },
  3: {
    name: 'Regional Pricing Benchmarks + Predictive Demand',
    description: 'Market intelligence and demand forecasting',
    icon: Globe,
    unlockCriteria: '50 transactions + $1,000 revenue (PRO)',
    minTx: 50,
    minRevenue: 1000,
    proOnly: true,
  },
};

export default function PosTierGates({
  tier,
  transactionCount,
  totalRevenue,
  nextGate,
}: PosTierGatesProps) {
  const [expanded, setExpanded] = useState(false);

  const isUnlocked = (tierNum: 1 | 2 | 3): boolean => {
    return tier >= tierNum;
  };

  const getProgressText = (tierNum: 1 | 2 | 3, txNeeded: number, revenueNeeded: number): string => {
    if (isUnlocked(tierNum)) return 'Unlocked';

    if (txNeeded > 0 && revenueNeeded > 0) {
      return `${txNeeded} more sale${txNeeded === 1 ? '' : 's'} or $${revenueNeeded.toFixed(2)} more`;
    } else if (txNeeded > 0) {
      return `${txNeeded} more sale${txNeeded === 1 ? '' : 's'}`;
    } else if (revenueNeeded > 0) {
      return `$${revenueNeeded.toFixed(2)} more revenue needed`;
    }

    return 'Almost there!';
  };

  const getTierProgress = (tierNum: 1 | 2 | 3): number => {
    const config = TIER_CONFIG[tierNum];
    const txProgress = Math.min(100, (transactionCount / config.minTx) * 100);
    const revenueProgress = Math.min(100, (totalRevenue / config.minRevenue) * 100);
    return Math.min(txProgress, revenueProgress);
  };

  const unlockedCount = ([1, 2, 3] as const).filter(t => isUnlocked(t)).length;

  return (
    <div className="mb-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-900 p-6">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between hover:opacity-75 transition"
        >
          <div className="text-left">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              POS Value Unlock Tiers
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {unlockedCount}/3 unlocked · {transactionCount} sales · ${totalRevenue.toFixed(2)}
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400 flex-shrink-0" />
          )}
        </button>

        {expanded && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {/* Tier 1 */}
          <TierCard
            tierNum={1}
            isUnlocked={isUnlocked(1)}
            progress={getTierProgress(1)}
            progressText={getProgressText(
              1,
              nextGate?.tier === 1 ? nextGate.txNeeded : 0,
              nextGate?.tier === 1 ? nextGate.revenueNeeded : 0
            )}
          />

          {/* Tier 2 */}
          <TierCard
            tierNum={2}
            isUnlocked={isUnlocked(2)}
            progress={getTierProgress(2)}
            progressText={getProgressText(
              2,
              nextGate?.tier === 2 ? nextGate.txNeeded : 0,
              nextGate?.tier === 2 ? nextGate.revenueNeeded : 0
            )}
          />

          {/* Tier 3 */}
          <TierCard
            tierNum={3}
            isUnlocked={isUnlocked(3)}
            progress={getTierProgress(3)}
            progressText={getProgressText(
              3,
              nextGate?.tier === 3 ? nextGate.txNeeded : 0,
              nextGate?.tier === 3 ? nextGate.revenueNeeded : 0
            )}
            requiresPro={true}
          />
          </div>
        )}
      </div>
    </div>
  );
}

interface TierCardProps {
  tierNum: 1 | 2 | 3;
  isUnlocked: boolean;
  progress: number;
  progressText: string;
  requiresPro?: boolean;
}

function TierCard({ tierNum, isUnlocked, progress, progressText, requiresPro }: TierCardProps) {
  const config = TIER_CONFIG[tierNum];
  const Icon = config.icon;

  return (
    <div
      className={`relative rounded-lg border-2 p-4 transition-all ${
        isUnlocked
          ? 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30'
      }`}
    >
      {/* Header with icon and status */}
      <div className="flex items-start justify-between mb-3">
        <Icon
          className={`w-6 h-6 ${
            isUnlocked ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'
          }`}
        />
        {isUnlocked ? (
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
        ) : (
          <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        )}
      </div>

      {/* Tier name */}
      <h3 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
        Tier {tierNum}: {config.name}
      </h3>

      {/* Description */}
      <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">{config.description}</p>

      {/* Unlock criteria and PRO badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-mono text-gray-500 dark:text-gray-500">
          {config.unlockCriteria}
        </span>
        {requiresPro && !isUnlocked && (
          <span className="text-xs font-semibold bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
            PRO
          </span>
        )}
      </div>

      {/* Progress bar */}
      {!isUnlocked && (
        <>
          <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 mb-2 overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 text-center">{progressText}</p>
        </>
      )}

      {isUnlocked && (
        <p className="text-xs font-semibold text-green-700 dark:text-green-300 text-center">
          ✓ Unlocked
        </p>
      )}
    </div>
  );
}
