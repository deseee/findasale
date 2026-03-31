/**
 * Shopper Dashboard - Enhanced
 *
 * For authenticated shoppers to view:
 * - Activity summary (purchases, watchlist, saved items, streak points)
 * - Sales near them
 * - Recently viewed items
 * - Active flash deals
 * - Wishlist previews
 * - Notification preferences
 * - Purchase history, subscriptions, and pickups in tabs
 * Note: Favorites consolidated into /shopper/wishlist (My Collections page)
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import Head from 'next/head';
import ActivitySummary from '../../components/ActivitySummary';
import SalesNearYou from '../../components/SalesNearYou';
import RecentlyViewed from '../../components/RecentlyViewed';
import FlashDealsBanner from '../../components/FlashDealsBanner';
import YourWishlists from '../../components/YourWishlists';
import NotificationPreferences from '../../components/NotificationPreferences';
import MyPickupAppointments from '../../components/MyPickupAppointments';
import EmptyState from '../../components/EmptyState';
import StreakWidget from '../../components/StreakWidget'; // CD2 Phase 2: Streak Challenges
import Skeleton from '../../components/Skeleton';
import { useFollows } from '../../hooks/useFollows';
import BrandFollowManager from '../../components/BrandFollowManager';
import ClaimCard from '../../components/ClaimCard'; // Hold-to-Pay: Shopper pending payments
import { useMyAchievements } from '../../hooks/useAchievements';
import { AchievementBadgesSection } from '../../components/AchievementBadgesSection';
import useXpProfile from '../../hooks/useXpProfile';
import RankBadge, { ExplorerRank } from '../../components/RankBadge';
import RankProgressBar from '../../components/RankProgressBar';

const ShopperDashboard = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'purchases' | 'subscribed' | 'pickups' | 'brands'>('overview');
  const [isHuntPassDismissed, setIsHuntPassDismissed] = useState(false);

  // Handle hash-based tab navigation on mount and when hash changes
  useEffect(() => {
    if (router.isReady && router.asPath.includes('#')) {
      const hash = router.asPath.split('#')[1];
      if (['overview', 'purchases', 'subscribed', 'pickups', 'brands'].includes(hash)) {
        setActiveTab(hash as any);
      }
    }
  }, [router.isReady, router.asPath]);

  // Load Hunt Pass dismissal state from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem('huntpass_cta_dismissed');
    if (dismissed) {
      setIsHuntPassDismissed(true);
    }
  }, []);

  const handleDismissHuntPass = () => {
    localStorage.setItem('huntpass_cta_dismissed', 'true');
    setIsHuntPassDismissed(true);
  };

  if (!isLoading && !user) {
    router.push('/login?redirect=/shopper/dashboard');
    return null;
  }

  const { data: purchases } = useQuery({
    queryKey: ['shopper-purchases'],
    queryFn: async () => {
      const response = await api.get('/users/purchases');
      return response.data;
    },
    enabled: !!user?.id,
  });

  // Favorites consolidated to /shopper/wishlist (My Collections page)

  const { data: userData } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const response = await api.get('/users/me');
      return response.data;
    },
    enabled: !!user?.id,
  });

  const { data: follows, isLoading: followsLoading } = useFollows();

  // Hold-to-Pay: Fetch pending invoices for shopper
  const { data: pendingInvoices = [] } = useQuery({
    queryKey: ['pending-invoices'],
    queryFn: async () => {
      const response = await api.get('/reservations/my-invoices');
      return response.data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch achievements for badges display
  const { data: achievementsData, isLoading: achievementsLoading } = useMyAchievements();

  // Fetch XP profile for rank progress
  const { data: xpProfile, isLoading: xpLoading } = useXpProfile(!!user?.id);

  // Rank threshold configuration
  const RANK_THRESHOLDS: Record<ExplorerRank, number> = {
    INITIATE: 500,
    SCOUT: 1500,
    RANGER: 2500,
    SAGE: 5000,
    GRANDMASTER: Infinity,
  };

  const getRankCopy = (rank: ExplorerRank, xp: number, nextRank: ExplorerRank | null) => {
    const threshold = RANK_THRESHOLDS[rank];
    const xpUntilNext = Math.max(0, threshold - xp);

    const configs: Record<ExplorerRank, any> = {
      INITIATE: {
        progressLabel: `${xp} / 500 XP`,
        untilNextRank: `${xpUntilNext} more XP until Scout`,
        earnTip: 'Scan an item (+10 XP each)',
        tipDetail: 'You can scan items from any sale on your phone.',
        ctaText: 'Browse Sales',
        ctaHref: '/',
      },
      SCOUT: {
        progressLabel: `${xp} / 1500 XP`,
        untilNextRank: `${xpUntilNext} more XP until Ranger`,
        earnTip: 'Make a purchase (+25 XP each)',
        tipDetail: "You're unlocking more perks — keep going.",
        ctaText: 'View Your Sales',
        ctaHref: '/sales',
      },
      RANGER: {
        progressLabel: `${xp} / 2500 XP`,
        untilNextRank: `${xpUntilNext} more XP until Sage`,
        earnTip: 'Visit sales daily (+5 XP each, once per sale)',
        tipDetail: "Daily visits build your streak. You're close to Sage perks.",
        ctaText: 'See Sales Near You',
        ctaHref: '/map',
      },
      SAGE: {
        progressLabel: `${xp} / 5000 XP`,
        untilNextRank: `${xpUntilNext} more XP until Grandmaster — the ultimate explorer rank`,
        earnTip: 'Keep your streak going',
        tipDetail: 'You unlock 6h Legendary-first access at Grandmaster.',
        ctaText: 'View Exclusive Hunt Pass Benefits',
        ctaHref: '/shopper/hunt-pass',
      },
      GRANDMASTER: {
        progressLabel: `${xp} / ∞`,
        untilNextRank: "You've reached the peak of the Explorer's Guild.",
        earnTip: 'You earn XP infinitely',
        tipDetail: 'You get first access to all Legendary items. Your rank badge appears on your public profile.',
        ctaText: 'View Your Public Profile',
        ctaHref: '/profile',
      },
    };

    return configs[rank];
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Determine shopper state: new (0 purchases) vs. returning (has purchases or saves)
  const isNewShopper = !purchases || purchases.length === 0;
  const hasSavedItems = false; // TODO: wire to collection API when available

  return (
    <>
      <Head>
        <title>My Dashboard - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Above the fold: State-aware hero section */}
          {isNewShopper ? (
            // State A: New shopper
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-8 mb-8 text-center">
              <h1 className="text-4xl font-bold text-warm-900 dark:text-warm-100 mb-2">Welcome to treasure hunting!</h1>
              <p className="text-lg text-warm-600 dark:text-warm-400 mb-6">Explore nearby sales, add your favorite items, and discover unique treasures.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/"
                  className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  Browse Sales
                </Link>
                <Link
                  href="/map"
                  className="inline-block border-2 border-amber-600 text-amber-600 hover:bg-amber-50 dark:hover:bg-gray-700 font-bold py-3 px-6 rounded-lg transition-colors"
                >
                  See What's Near You
                </Link>
              </div>
            </div>
          ) : (
            // State B: Returning shopper
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                Welcome back, {user?.firstName || user?.name || 'Explorer'}!
              </h1>

              {/* Personalized hook: Priority 1 - Pending payments */}
              {pendingInvoices && pendingInvoices.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 mb-6 rounded">
                  <p className="text-red-900 dark:text-red-300 font-semibold">
                    💳 You have {pendingInvoices.length} pending payment{pendingInvoices.length !== 1 ? 's' : ''} due by{' '}
                    {pendingInvoices[0]?.expiresAt
                      ? new Date(pendingInvoices[0].expiresAt).toLocaleDateString()
                      : 'soon'}
                  </p>
                  <Link
                    href="#overview"
                    className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-semibold underline text-sm mt-2 inline-block"
                  >
                    Complete Payments →
                  </Link>
                </div>
              )}

              {/* Personalized hook: Priority 2 - Collections summary (if no pending payments) */}
              {(!pendingInvoices || pendingInvoices.length === 0) && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 mb-6 rounded">
                  <p className="text-blue-900 dark:text-blue-300 font-semibold">
                    You have items saved. Ready to continue your hunt?
                  </p>
                  <Link
                    href="/shopper/wishlist"
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-semibold underline text-sm mt-2 inline-block"
                  >
                    View Your Collections →
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Quick Links */}
          <div className="flex flex-wrap gap-2 mb-8">
            <Link
              href="/shopper/explorer-passport"
              className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-2 hover:shadow-md transition-shadow flex flex-col items-center"
            >
              <div className="text-lg mb-0.5">🗺️</div>
              <p className="text-xs font-semibold text-purple-900 dark:text-purple-300">Explorer</p>
            </Link>
            <Link
              href="/shopper/loyalty"
              className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-2 hover:shadow-md transition-shadow flex flex-col items-center"
            >
              <div className="text-lg mb-0.5">✨</div>
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">Loyalty</p>
            </Link>
            <Link
              href="/shopper/wishlist"
              className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-2 hover:shadow-md transition-shadow flex flex-col items-center"
            >
              <div className="text-lg mb-0.5">💕</div>
              <p className="text-xs font-semibold text-blue-900 dark:text-blue-300">Collections</p>
            </Link>
            <Link
              href="/shopper/trails"
              className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border border-green-200 dark:border-green-700 rounded-lg p-2 hover:shadow-md transition-shadow flex flex-col items-center"
            >
              <div className="text-lg mb-0.5">🗺️</div>
              <p className="text-xs font-semibold text-green-900 dark:text-green-300">Trails</p>
            </Link>
            <Link
              href="/shopper/loot-log"
              className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-2 hover:shadow-md transition-shadow flex flex-col items-center"
            >
              <div className="text-lg mb-0.5">📜</div>
              <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">Loot Log</p>
            </Link>
            <Link
              href="/shopper/receipts"
              className="bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-900/30 dark:to-pink-900/30 border border-rose-200 dark:border-rose-700 rounded-lg p-2 hover:shadow-md transition-shadow flex flex-col items-center"
            >
              <div className="text-lg mb-0.5">🧾</div>
              <p className="text-xs font-semibold text-rose-900 dark:text-rose-300">Receipts</p>
            </Link>
            <Link
              href="/shopper/hauls"
              className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-2 hover:shadow-md transition-shadow flex flex-col items-center"
            >
              <div className="text-lg mb-0.5">📸</div>
              <p className="text-xs font-semibold text-orange-900 dark:text-orange-300">Hauls</p>
            </Link>
          </div>

          {/* Gamification Section */}
          <div className="space-y-6 mb-8">
            {/* Streak Widget with permanent explainer */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-6">
              <p className="text-sm text-warm-600 dark:text-warm-400 mb-4 italic">
                Visit one sale per week to keep your streak alive and earn bonus XP.
              </p>
              <StreakWidget />
            </div>

            {/* Rank Progress Card */}
            {xpProfile && !xpLoading ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <RankBadge rank={xpProfile.explorerRank} size="md" />
                  <div>
                    <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100">
                      {xpProfile.explorerRank.charAt(0) + xpProfile.explorerRank.slice(1).toLowerCase()}
                    </h3>
                    <p className="text-sm text-warm-600 dark:text-warm-400">Explorer Rank</p>
                  </div>
                </div>

                {(() => {
                  const rankCopy = getRankCopy(
                    xpProfile.explorerRank,
                    xpProfile.rankProgress.currentXp,
                    xpProfile.rankProgress.nextRank
                  );
                  return (
                    <>
                      <div className="mb-4">
                        <p className="text-sm text-warm-600 dark:text-warm-400 mb-2">{rankCopy.progressLabel}</p>
                        <RankProgressBar
                          currentXp={xpProfile.rankProgress.currentXp}
                          nextRankXp={RANK_THRESHOLDS[xpProfile.explorerRank]}
                          currentRank={xpProfile.explorerRank}
                          nextRank={xpProfile.rankProgress.nextRank}
                        />
                      </div>

                      <div className="mb-4">
                        <p className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2">
                          {rankCopy.untilNextRank}
                        </p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">
                          Best way to earn right now: {rankCopy.earnTip}
                        </p>
                        <p className="text-xs text-warm-500 dark:text-warm-500 mt-1">
                          {rankCopy.tipDetail}
                        </p>
                      </div>

                      <Link
                        href={rankCopy.ctaHref}
                        className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                      >
                        {rankCopy.ctaText} →
                      </Link>
                    </>
                  );
                })()}
              </div>
            ) : (
              <Skeleton className="h-64" />
            )}

            {/* Hunt Pass CTA */}
            {user && !user.huntPassActive ? (
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 border border-purple-300 dark:border-purple-600 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <span className="text-3xl">🎯</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-purple-900 dark:text-purple-300 mb-2">Hunt Pass — Level Up Faster</h3>
                    <ul className="text-sm text-purple-800 dark:text-purple-200 mb-4 space-y-1">
                      <li>⭐ <strong>1.5x XP multiplier</strong> on everything you do</li>
                      <li>⚡ <strong>6-hour early access</strong> to Legendary items</li>
                      <li>🏆 <strong>Exclusive Grandmaster badge</strong> on your profile</li>
                    </ul>
                    <p className="text-sm font-semibold text-purple-900 dark:text-purple-300 mb-4">$4.99/month. Cancel anytime.</p>
                    <Link
                      href="/shopper/hunt-pass"
                      className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                    >
                      Unlock 1.5x XP
                    </Link>
                  </div>
                </div>
              </div>
            ) : user && user.huntPassActive ? (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-600 rounded-lg p-6">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">✅</span>
                  <div>
                    <h3 className="font-semibold text-green-900 dark:text-green-300">Hunt Pass Active</h3>
                    <p className="text-sm text-green-800 dark:text-green-300">You're earning 1.5x XP and get 6-hour early access to Legendary items.</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>


          {/* Tabs */}
          <div className="flex gap-2 mb-8 border-b border-warm-200 dark:border-gray-700 overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'purchases', label: 'Purchases' },
              { id: 'subscribed', label: 'Subscribed' },
              { id: 'pickups', label: 'Pickups' },
              { id: 'brands', label: 'Brands' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  router.push(`#${tab.id}`);
                }}
                className={`pb-2 font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-amber-600 text-amber-600'
                    : 'text-warm-600 dark:text-warm-400 hover:text-warm-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Hold-to-Pay: Pending Payments Section */}
              {pendingInvoices && pendingInvoices.length > 0 && (
                <div>
                  <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100 mb-4">
                    💳 Pending Payments ({pendingInvoices.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pendingInvoices.map((invoice: any) => (
                      <ClaimCard
                        key={invoice.id}
                        invoiceId={invoice.id}
                        itemId={invoice.itemId}
                        itemTitle={invoice.itemTitle}
                        itemPrice={invoice.itemPrice}
                        itemPhoto={invoice.itemPhoto}
                        checkoutUrl={invoice.checkoutUrl}
                        expiresAt={invoice.expiresAt}
                        organizerName={invoice.organizerName}
                        onPaymentSuccess={() => {
                          // Refetch invoices after payment
                          window.location.reload();
                        }}
                        onReleaseHold={() => {
                          // Refetch invoices after releasing hold
                          window.location.reload();
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Hunt Pass Info Card */}
              {!isHuntPassDismissed && userData && !userData.huntPassActive && (
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-2 border-purple-300 dark:border-purple-600 rounded-lg p-6">
                  <div className="flex items-start gap-4">
                    <span className="text-3xl">👑</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-purple-900 dark:text-purple-300 mb-2">Unlock Hunt Pass Premium</h3>
                      <p className="text-sm text-purple-800 dark:text-purple-200 mb-3">Level up your treasure hunting with exclusive benefits:</p>
                      <ul className="text-sm text-purple-800 dark:text-purple-200 mb-4 space-y-1 ml-4">
                        <li>⭐ <strong>2x XP multiplier</strong> on every action</li>
                        <li>⚡ <strong>6h early access</strong> to Legendary item drops</li>
                        <li>🎖️ <strong>Exclusive Hunt Pass badge</strong> on your profile</li>
                      </ul>
                      <p className="text-xs text-purple-700 dark:text-purple-400 mb-4 font-semibold">Only $4.99/month. Cancel anytime.</p>
                      <div className="flex gap-2 mt-4">
                        <Link
                          href="/shopper/hunt-pass"
                          className="inline-block py-2 px-5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors"
                        >
                          Upgrade Now
                        </Link>
                        <button
                          onClick={handleDismissHuntPass}
                          className="text-sm font-semibold text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-200 underline"
                        >
                          Not interested
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={handleDismissHuntPass}
                      className="flex-shrink-0 text-purple-400 dark:text-purple-500 hover:text-purple-600 dark:hover:text-purple-400"
                      aria-label="Dismiss Hunt Pass banner"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Hunt Pass Active Badge */}
              {userData && userData.huntPassActive && (
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">✅</span>
                    <div className="flex-1">
                      <h3 className="font-semibold text-purple-900 dark:text-purple-300 mb-1">Hunt Pass Active</h3>
                      <p className="text-sm text-purple-800 dark:text-purple-200">You're earning 2x XP on every action and get early access to flash deals!</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Achievements Badges */}
              {achievementsData?.achievements && achievementsData.achievements.length > 0 && !achievementsLoading && (
                <AchievementBadgesSection
                  achievements={achievementsData.achievements}
                  showStats={true}
                />
              )}

              <ActivitySummary />

              {/* SalesNearYou hides itself on error state */}
              <SalesNearYou />

              <RecentlyViewed />

              <FlashDealsBanner />

              <YourWishlists />
            </div>
          )}

          {/* Purchases Tab */}
          {activeTab === 'purchases' && (
            <div>
              {purchases && purchases.length > 0 ? (
                <div className="space-y-4">
                  {purchases.map((purchase: any) => (
                    <Link key={purchase.id} href={purchase.itemId ? `/items/${purchase.itemId}` : `/sales/${purchase.saleId}`}>
                      <div className="card p-4 flex justify-between items-center dark:bg-gray-800 dark:border-gray-700 hover:shadow-lg transition-shadow cursor-pointer">
                        <div>
                          <h3 className="font-semibold text-warm-900 dark:text-warm-100">{purchase.itemTitle}</h3>
                          <p className="text-sm text-warm-600 dark:text-warm-400">Purchased on {purchase.purchasedAt}</p>
                        </div>
                        <span className="font-bold text-warm-900 dark:text-warm-100">${purchase.amount}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <p className="text-5xl mb-4">🛍️</p>
                  <h3 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-2">No purchases yet</h3>
                  <p className="text-warm-600 dark:text-warm-400 mb-6">When you buy an item at a sale, it will show up here.</p>
                  <Link
                    href="/"
                    className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                  >
                    Browse Sales
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Subscribed Tab */}
          {activeTab === 'subscribed' && (
            <div>
              {followsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
                </div>
              ) : follows && follows.length > 0 ? (
                <div className="space-y-3">
                  {follows.map((follow) => (
                    <div key={follow.id} className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow">
                      {follow.organizer.profilePhoto ? (
                        <img
                          src={follow.organizer.profilePhoto}
                          alt={follow.organizer.businessName}
                          className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-700 dark:text-amber-300 font-bold text-lg flex-shrink-0">
                          {follow.organizer.businessName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <Link href={`/organizers/${follow.organizerId}`}>
                          <p className="font-semibold text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 truncate cursor-pointer">
                            {follow.organizer.businessName}
                          </p>
                        </Link>
                        <p className="text-xs text-warm-500 dark:text-warm-400">
                          Following since {new Date(follow.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <p className="text-5xl mb-4">🔔</p>
                  <h3 className="text-xl font-semibold text-warm-900 dark:text-warm-100 mb-2">No organizers followed yet</h3>
                  <p className="text-warm-600 dark:text-warm-400 mb-6">
                    Follow an organizer from any sale page to see their upcoming sales here.
                  </p>
                  <Link
                    href="/"
                    className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                  >
                    Browse Sales
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Pickups Tab */}
          {activeTab === 'pickups' && (
            <MyPickupAppointments />
          )}

          {/* Brands Tab */}
          {activeTab === 'brands' && (
            <BrandFollowManager />
          )}
        </div>
      </div>
    </>
  );
};

export default ShopperDashboard;
