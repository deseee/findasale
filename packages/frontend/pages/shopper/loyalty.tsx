/**
 * Feature #29: Shopper Loyalty Passport Page
 *
 * Page: /shopper/loyalty
 * - Display loyalty tier and points balance
 * - Show stamps earned across sales
 * - Track milestone progress and badges
 * - View loyalty rewards and benefits
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useLoyaltyPassport } from '@/hooks/useLoyaltyPassport';
import useXpProfile from '@/hooks/useXpProfile';
import { RankBadge } from '@/components/RankBadge';
import { RankProgressBar } from '@/components/RankProgressBar';
import { useAuth } from '@/components/AuthContext';
import { useToast } from '@/components/ToastContext';
import { useXpSink } from '@/hooks/useXpSink';

function LoyaltyPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { passport, isLoading: passportLoading, error, refetch } = useLoyaltyPassport();
  const { data: xpProfile, isLoading: xpLoading } = useXpProfile(!!user);
  const { showToast } = useToast();
  const { spendXpCoupon, isLoading: sinkLoading, error: sinkError } = useXpSink({
    onSuccess: (response) => {
      showToast(response.message, 'success');
    },
    onError: (error) => {
      showToast(error, 'error');
    },
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if not authenticated
  if (mounted && !authLoading && !user) {
    router.push('/login');
    return null;
  }

  if (authLoading || passportLoading || xpLoading || !mounted) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">Loading your loyalty passport...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center dark:bg-red-900 dark:border-red-700">
          <p className="text-red-700 dark:text-red-300">Unable to load your loyalty passport. Please try again.</p>
          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg dark:bg-amber-700 dark:hover:bg-amber-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!passport) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">No loyalty data available.</p>
      </div>
    );
  }

  // Mock tier data for display — adjust based on actual tier logic
  const tierLevels = [
    { name: 'Bronze', min: 0, max: 99, color: '#8B4513', nextStamps: 100 },
    { name: 'Silver', min: 100, max: 299, color: '#C0C0C0', nextStamps: 300 },
    { name: 'Gold', min: 300, max: 499, color: '#FFD700', nextStamps: 500 },
    { name: 'Platinum', min: 500, max: Infinity, color: '#E5E4E2', nextStamps: null },
  ];

  const currentTierData = tierLevels[Math.min(Math.floor(passport.totalStamps / 100), 3)];
  const progressPercent = ((passport.stampsToNextMilestone || 0) / (currentTierData.nextStamps || 100)) * 100;

  return (
    <>
      <Head>
        <title>Loyalty Passport - FindA.Sale</title>
      </Head>

      <div className="max-w-5xl mx-auto py-8 px-4">
          {/* Header */}
          <div className="mb-10">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-warm-100 mb-2">Explorer's Guild Passport</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Earn stamps and unlock rewards as you shop and explore
            </p>
          </div>

          {/* Guild XP & Rank Card */}
          {xpProfile && (
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg shadow-md p-8 mb-8 border-2 border-indigo-200 dark:from-gray-800 dark:to-gray-700 dark:border-indigo-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Rank Display */}
                <div>
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4">Explorer Rank</p>
                  <div className="flex items-center gap-6">
                    <RankBadge rank={xpProfile.explorerRank} size="lg" />
                    <div>
                      <p className="text-3xl font-bold text-indigo-700 dark:text-indigo-400">
                        {xpProfile.guildXp.toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Guild XP</p>
                    </div>
                  </div>
                </div>

                {/* Progress to Next Rank */}
                <div className="flex flex-col justify-center">
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-4">Rank Progress</p>
                  <RankProgressBar
                    currentXp={xpProfile.rankProgress.currentXp}
                    nextRankXp={xpProfile.rankProgress.nextRankXp}
                    currentRank={xpProfile.explorerRank}
                    nextRank={xpProfile.rankProgress.nextRank}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Spend XP Section */}
          {xpProfile && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8 border-l-4 border-indigo-500 dark:border-indigo-400">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-warm-100 mb-6">Spend Your XP ✨</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Coupon Generation Sink */}
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-200 dark:from-gray-700 dark:to-gray-600 dark:border-blue-700">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">🎫</p>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-warm-100 mt-2">Generate Coupon</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Cost</p>
                      <p className="text-xl font-bold text-blue-700 dark:text-blue-400">20 XP</p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Create a $1 off discount coupon to use on future purchases. Coupons expire in 30 days.
                  </p>

                  <button
                    onClick={spendXpCoupon}
                    disabled={sinkLoading || xpProfile.guildXp < 20}
                    className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                      xpProfile.guildXp < 20
                        ? 'bg-gray-300 text-gray-500 dark:bg-gray-600 dark:text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800'
                    } ${sinkLoading ? 'opacity-70' : ''}`}
                  >
                    {sinkLoading ? 'Processing...' : 'Generate Coupon'}
                  </button>

                  {xpProfile.guildXp < 20 && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                      Need {(20 - xpProfile.guildXp).toLocaleString()} more XP
                    </p>
                  )}
                </div>

                {/* Coming Soon: Rarity Boost */}
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-6 border border-amber-200 dark:from-gray-700 dark:to-gray-600 dark:border-amber-700 opacity-60">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">🎯</p>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-warm-100 mt-2">Rarity Boost</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Cost</p>
                      <p className="text-xl font-bold text-amber-700 dark:text-amber-400">15 XP</p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Boost your odds of finding legendary items at a specific sale for 24 hours. Choose a sale and activate!
                  </p>

                  <button disabled className="w-full py-3 rounded-lg font-semibold bg-gray-300 text-gray-500 dark:bg-gray-600 dark:text-gray-400 cursor-not-allowed">
                    Coming Soon
                  </button>
                </div>
              </div>

              {sinkError && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded text-red-700 dark:text-red-300 text-sm">
                  {sinkError}
                </div>
              )}
            </div>
          )}

          {/* Current Tier Card */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg shadow-md p-8 mb-8 border-2 border-amber-200 dark:from-gray-800 dark:to-gray-700 dark:border-amber-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Tier Info */}
              <div>
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Current Tier</p>
                <div className="flex items-end gap-3 mb-4">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md"
                    style={{ backgroundColor: currentTierData.color }}
                  >
                    {currentTierData.name[0]}
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-warm-100">{currentTierData.name}</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{passport.totalStamps} total stamps</p>
                  </div>
                </div>
              </div>

              {/* Points Balance */}
              <div className="flex flex-col justify-center">
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Points Balance</p>
                <div className="text-4xl font-bold text-amber-700 dark:text-amber-400 mb-2">
                  {passport.totalStamps ?? 0}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {currentTierData.nextStamps
                    ? `${currentTierData.nextStamps - (passport.totalStamps ?? 0)} stamps to ${tierLevels[Math.min(Math.floor((passport.totalStamps ?? 0) / 100) + 1, 3)].name}`
                    : 'You\'ve reached max tier!'}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            {currentTierData.nextStamps && (
              <div className="mt-6">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Progress to Next Tier</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">{Math.round(progressPercent)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
                  <div
                    className="bg-gradient-to-r from-amber-400 to-amber-600 h-3 rounded-full transition-all"
                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Stamps Breakdown */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-warm-100 mb-6">Your Stamps</h3>

            {passport.stamps && passport.stamps.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {passport.stamps.map((stamp) => (
                  <div
                    key={stamp.type}
                    className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-200 text-center dark:from-gray-700 dark:to-gray-600 dark:border-amber-700"
                  >
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      {stamp.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    <p className="text-3xl font-bold text-amber-700 dark:text-amber-400">{stamp.count}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Stamps</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-gray-600 dark:text-gray-400">No stamps yet. Start shopping to earn stamps!</p>
              </div>
            )}
          </div>

          {/* Milestone Progress */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-warm-100 mb-6">Milestones & Badges</h3>

            {passport.milestones && passport.milestones.length > 0 ? (
              <div className="space-y-4">
                {passport.milestones.map((milestone, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200 dark:from-gray-700 dark:to-gray-600 dark:border-purple-700"
                  >
                    <div className="flex-shrink-0">
                      <div className="flex items-center justify-center h-12 w-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-400">
                        <span className="text-xl">🏆</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 dark:text-warm-100">
                        Milestone {milestone.milestone}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {milestone.badgeType} • Earned {new Date(milestone.earnedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <p className="text-gray-600 dark:text-gray-400">
                  Earn {passport.nextMilestone || 'more'} stamps to unlock your first badge!
                </p>
              </div>
            )}
          </div>

          {/* Benefits & Rewards */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-md p-8 border border-green-200 dark:from-gray-800 dark:to-gray-700 dark:border-green-700">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-warm-100 mb-6">Your Benefits</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 text-2xl">🎁</div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-warm-100">Exclusive Deals</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Early access to curated sales</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 text-2xl">⚡</div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-warm-100">Priority Listings</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">See new items before others</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 text-2xl">💎</div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-warm-100">Tier-Based Discounts</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {currentTierData.name} members get special perks
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="flex-shrink-0 text-2xl">🌟</div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-warm-100">Badges & Recognition</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Showcase your explorer status</p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="mt-12 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">Ready to earn more stamps?</p>
            <Link
              href="/sales"
              className="inline-block px-8 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors dark:bg-amber-700 dark:hover:bg-amber-800"
            >
              Browse Sales
            </Link>
          </div>
        </div>
    </>
  );
}

export default LoyaltyPage;
