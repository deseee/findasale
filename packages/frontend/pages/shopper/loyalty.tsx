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
import StreakWidget from '@/components/StreakWidget';
import { useMyAchievements } from '@/hooks/useAchievements';
import { AchievementBadgesSection } from '@/components/AchievementBadgesSection';

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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const { data: achievementsData, isLoading: achievementsLoading } = useMyAchievements();

  useEffect(() => {
    setMounted(true);
    // Check if user has seen onboarding (use localStorage key: guild_onboarded)
    if (typeof window !== 'undefined') {
      const hasSeenOnboarding = localStorage.getItem('guild_onboarded') === 'true';
      if (!hasSeenOnboarding) {
        setShowOnboarding(true);
      }
    }
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
  // Using Explorer's Guild tier names and emojis
  const tierLevels = [
    { name: 'Initiate', emoji: '🌱', min: 0, max: 99, color: '#8B4513', nextStamps: 100 },
    { name: 'Scout', emoji: '🐦', min: 100, max: 299, color: '#C0C0C0', nextStamps: 300 },
    { name: 'Ranger', emoji: '🧗', min: 300, max: 499, color: '#FFD700', nextStamps: 500 },
    { name: 'Sage', emoji: '🧙', min: 500, max: 999, color: '#9933FF', nextStamps: 1000 },
    { name: 'Grandmaster', emoji: '👑', min: 1000, max: Infinity, color: '#FFD700', nextStamps: null },
  ];

  const currentTierData = tierLevels[Math.min(Math.floor(passport.totalStamps / 100), 4)];
  const progressPercent = ((passport.stampsToNextMilestone || 0) / (currentTierData.nextStamps || 100)) * 100;

  const handleOnboardingClose = () => {
    localStorage.setItem('guild_onboarded', 'true');
    setShowOnboarding(false);
  };

  const handleNextOnboardingStep = () => {
    if (onboardingStep < 2) {
      setOnboardingStep(onboardingStep + 1);
    } else {
      handleOnboardingClose();
    }
  };

  return (
    <>
      <Head>
        <title>Loyalty Passport - FindA.Sale</title>
      </Head>

      {/* Onboarding Modal */}
      {showOnboarding && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              {onboardingStep === 0 && (
                <>
                  <div className="text-4xl mb-4 text-center">🔍</div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-warm-100 mb-4">
                    Explore like a pro
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">
                    Visit sales, scan items, and win auctions to earn Guild XP
                  </p>
                  <button
                    onClick={handleNextOnboardingStep}
                    className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors font-medium"
                  >
                    Next →
                  </button>
                </>
              )}
              {onboardingStep === 1 && (
                <>
                  <div className="text-4xl mb-4 text-center">👑</div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-warm-100 mb-4">
                    Climb the ranks
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">
                    🌱 Initiate → 🐦 Scout → 🧗 Ranger → 🧙 Sage → 👑 Grandmaster
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Each rank unlocks real perks
                  </p>
                  <button
                    onClick={handleNextOnboardingStep}
                    className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors font-medium"
                  >
                    Next →
                  </button>
                </>
              )}
              {onboardingStep === 2 && (
                <>
                  <div className="text-4xl mb-4 text-center">🎯</div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-warm-100 mb-4">
                    Your first quest
                  </h2>
                  <p className="text-gray-600 dark:text-gray-300 mb-6">
                    Visit any sale this week to earn your first XP. Check your progress here anytime.
                  </p>
                  <button
                    onClick={handleOnboardingClose}
                    className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors font-medium"
                  >
                    Got it →
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
                      <div className="flex items-center gap-2">
                        <p className="text-3xl font-bold text-indigo-700 dark:text-indigo-400">
                          {xpProfile.guildXp.toLocaleString()}
                        </p>
                        <div className="group relative cursor-help">
                          <span className="text-lg text-indigo-600 dark:text-indigo-400">ℹ️</span>
                          <div className="hidden group-hover:block absolute left-0 z-10 w-56 p-3 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg whitespace-normal">
                            Earn XP by visiting sales (+5), scanning items (+10), and making purchases (+25).
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Guild XP</p>
                    </div>
                  </div>
                </div>

                {/* Progress to Next Rank */}
                <div className="flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-4">
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Rank Progress</p>
                    <div className="group relative cursor-help">
                      <span className="text-sm text-indigo-600 dark:text-indigo-400 font-bold">ℹ️</span>
                      <div className="hidden group-hover:block absolute right-0 z-10 w-48 p-3 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg whitespace-normal">
                        Rank thresholds: 🌱 Initiate (0 XP) → 🐦 Scout (500 XP) → 🧗 Ranger (1,500 XP) → 🧙 Sage (2,500 XP) → 👑 Grandmaster (5,000 XP)
                      </div>
                    </div>
                  </div>
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

          {/* Streak Widget */}
          <div className="mb-8">
            <StreakWidget />
          </div>

          {/* How to Earn XP */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-6 mb-8 border-l-4 border-indigo-500 dark:border-indigo-400">
            <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-200 mb-4">How to Earn Guild XP</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex gap-3">
                <span className="text-2xl">📱</span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-warm-100">Scan an Item</p>
                  <p className="text-gray-600 dark:text-gray-400">+10 XP per scan</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl">🚪</span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-warm-100">Visit a Sale</p>
                  <p className="text-gray-600 dark:text-gray-400">+5 XP per visit</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl">🛒</span>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-warm-100">Make a Purchase</p>
                  <p className="text-gray-600 dark:text-gray-400">+25 XP per transaction</p>
                </div>
              </div>
            </div>
          </div>

          {/* Spend XP Section */}
          {xpProfile && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8 border-l-4 border-indigo-500 dark:border-indigo-400">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-warm-100 mb-2">Spend Your Guild XP ✨</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Unlock exclusive rewards and perks by spending the XP you earn.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Coupon Generation Sink */}
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-200 dark:from-gray-700 dark:to-gray-600 dark:border-blue-700">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">🎫</p>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-warm-100 mt-2">Discount Coupon</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Cost</p>
                      <p className="text-xl font-bold text-blue-700 dark:text-blue-400">20 XP</p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Generate a $1 off coupon to use at any sale. Coupons are valid for 30 days. Redeem your XP for real savings!
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
                      <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">✨</p>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-warm-100 mt-2">Rarity Boost</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Cost</p>
                      <p className="text-xl font-bold text-amber-700 dark:text-amber-400">15 XP</p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Increase your chances of discovering legendary finds at a sale of your choice for 24 hours. Target your hunt and maximize your rewards!
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
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Your Explorer Tier</p>
                <div className="flex items-end gap-3 mb-4">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-3xl font-bold shadow-md"
                    style={{ backgroundColor: currentTierData.color }}
                  >
                    {currentTierData.emoji}
                  </div>
                  <div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-warm-100">{currentTierData.name}</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{passport.totalStamps} total stamps</p>
                  </div>
                </div>
              </div>

              {/* Stamps Balance */}
              <div className="flex flex-col justify-center">
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Total Stamps Earned</p>
                <div className="text-4xl font-bold text-amber-700 dark:text-amber-400 mb-2">
                  {passport.totalStamps ?? 0}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {currentTierData.nextStamps
                    ? `${currentTierData.nextStamps - (passport.totalStamps ?? 0)} stamps to ${tierLevels[Math.min(Math.floor((passport.totalStamps ?? 0) / 1000) + 1, 4)].name}`
                    : 'You\'ve reached Grandmaster — the peak of the Explorer\'s Guild!'}
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
            <h3 className="text-2xl font-bold text-gray-900 dark:text-warm-100 mb-2">Your Stamps</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Stamps track your lifetime achievement. Collect enough to climb the tiers and unlock exclusive perks.</p>

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

          {/* Hunt Pass Section */}
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 rounded-lg shadow-md p-8 mb-8 border-2 border-yellow-300 dark:from-yellow-900 dark:to-amber-900 dark:border-yellow-600">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">🎯 Hunt Pass Exclusive</h3>
                  <span className="inline-block px-3 py-1 bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 text-sm font-semibold rounded">$4.99/month</span>
                </div>
                <p className="text-yellow-800 dark:text-yellow-200 mb-4">
                  Upgrade to Hunt Pass for early access to legendary items and earn 1.5x XP rewards.
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link
                    href="/shopper/loot-legend"
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors"
                  >
                    View Loot Legend
                  </Link>
                  <Link
                    href="/shopper/league"
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Collector's League
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Achievements Badges */}
          {achievementsData?.achievements && achievementsData.achievements.length > 0 && !achievementsLoading && (
            <div className="mb-8">
              <AchievementBadgesSection
                achievements={achievementsData.achievements}
                showStats={true}
              />
            </div>
          )}

          {/* Benefits & Rewards */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg shadow-md p-8 border border-green-200 dark:from-gray-800 dark:to-gray-700 dark:border-green-700">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-warm-100 mb-2">Explorer's Guild Perks</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Unlock exclusive benefits and recognition as you climb the ranks.</p>

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
