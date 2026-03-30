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

  return (
    <>
      <Head>
        <title>My Dashboard - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-8">My Dashboard</h1>

          {/* Quick Links */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            <Link
              href="/shopper/explorer-passport"
              className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4 text-center hover:shadow-md transition-shadow"
            >
              <div className="text-2xl mb-2">🗺️</div>
              <p className="text-xs font-semibold text-purple-900 dark:text-purple-300">Explorer</p>
            </Link>
            <Link
              href="/shopper/loyalty"
              className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4 text-center hover:shadow-md transition-shadow"
            >
              <div className="text-2xl mb-2">✨</div>
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">Loyalty</p>
            </Link>
            <Link
              href="/shopper/wishlist"
              className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-center hover:shadow-md transition-shadow"
            >
              <div className="text-2xl mb-2">💕</div>
              <p className="text-xs font-semibold text-blue-900 dark:text-blue-300">Collections</p>
            </Link>
            <Link
              href="/shopper/trails"
              className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4 text-center hover:shadow-md transition-shadow"
            >
              <div className="text-2xl mb-2">🗺️</div>
              <p className="text-xs font-semibold text-green-900 dark:text-green-300">Trails</p>
            </Link>
            <Link
              href="/shopper/loot-log"
              className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4 text-center hover:shadow-md transition-shadow"
            >
              <div className="text-2xl mb-2">📜</div>
              <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-300">Loot Log</p>
            </Link>
            <Link
              href="/shopper/receipts"
              className="bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-900/30 dark:to-pink-900/30 border border-rose-200 dark:border-rose-700 rounded-lg p-4 text-center hover:shadow-md transition-shadow"
            >
              <div className="text-2xl mb-2">🧾</div>
              <p className="text-xs font-semibold text-rose-900 dark:text-rose-300">Receipts</p>
            </Link>
            <Link
              href="/shopper/hauls"
              className="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/30 dark:to-amber-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4 text-center hover:shadow-md transition-shadow"
            >
              <div className="text-2xl mb-2">📸</div>
              <p className="text-xs font-semibold text-orange-900 dark:text-orange-300">Hauls</p>
            </Link>
          </div>

          {/* Gamification Widgets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {/* Widget 1: Streak Tracker */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-300 mb-1">🔥 Streak Tracker</p>
                  <p className="text-3xl font-bold text-amber-700 dark:text-amber-400">0</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">days</p>
                </div>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300">Start your streak — visit a sale this week!</p>
            </div>

            {/* Widget 2: Rank & XP Bar */}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
              <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-300 mb-3">⭐ Rank & XP</p>
              <div className="mb-2">
                <p className="text-lg font-bold text-indigo-700 dark:text-indigo-400">Initiate</p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400">0 / 500 XP</p>
              </div>
              <div className="w-full bg-indigo-200 dark:bg-indigo-800 rounded-full h-2 overflow-hidden">
                <div className="bg-indigo-600 dark:bg-indigo-500 h-full" style={{ width: '0%' }}></div>
              </div>
              {/* TODO: wire to real ExplorerProfile XP/rank data */}
            </div>

            {/* Widget 3: Recent Achievements */}
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
              <p className="text-sm font-semibold text-purple-900 dark:text-purple-300 mb-3">🏅 Recent Achievements</p>
              <p className="text-xs text-purple-700 dark:text-purple-300">No badges yet — start exploring sales!</p>
              {/* TODO: wire to real Achievement/UserAchievement data */}
            </div>

            {/* Widget 4: Hunt Pass CTA (spans full width on mobile, 1/3 on desktop if not active) */}
            {userData && !userData.huntPassActive && (
              <div className="sm:col-span-2 lg:col-span-1 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 border border-purple-300 dark:border-purple-600 rounded-lg p-4">
                <p className="text-sm font-semibold text-purple-900 dark:text-purple-300 mb-2">🎟️ Hunt Pass</p>
                <p className="text-xs text-purple-800 dark:text-purple-200 mb-3">$4.99/mo</p>
                <ul className="text-xs text-purple-800 dark:text-purple-200 space-y-1 mb-3">
                  <li>⭐ 2x XP multiplier</li>
                  <li>⚡ 6h early access</li>
                </ul>
                <Link
                  href="/hunt-pass"
                  className="inline-block text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded font-medium transition-colors"
                >
                  Get Hunt Pass →
                </Link>
              </div>
            )}

            {userData && userData.huntPassActive && (
              <div className="sm:col-span-2 lg:col-span-1 bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-600 rounded-lg p-4">
                <p className="text-sm font-semibold text-green-900 dark:text-green-300 mb-1">✅ Hunt Pass Active</p>
                <p className="text-xs text-green-800 dark:text-green-300">You're earning 2x XP and get early access!</p>
              </div>
            )}

            {/* Widget 5: Leaderboard Snippet */}
            <div className="sm:col-span-2 lg:col-span-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-3">🏆 This Week's Top Explorers</p>
              <div className="space-y-2 text-xs text-blue-800 dark:text-blue-300 mb-3">
                <div className="flex justify-between">
                  <span>1. Explorer #1</span>
                  <span className="font-semibold">5,200 XP</span>
                </div>
                <div className="flex justify-between">
                  <span>2. Explorer #2</span>
                  <span className="font-semibold">4,850 XP</span>
                </div>
                <div className="flex justify-between">
                  <span>3. Explorer #3</span>
                  <span className="font-semibold">4,100 XP</span>
                </div>
              </div>
              <Link
                href="/league"
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
              >
                View Full League →
              </Link>
              {/* TODO: wire to real leaderboard API endpoint */}
            </div>
          </div>

          {/* Calendar Widget - Saved Sales Coming Up */}
          <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100">📅 Saved Sales Coming Up</h3>
            </div>
            <div className="text-center py-6">
              <p className="text-warm-600 dark:text-warm-400 mb-4">No upcoming saved sales</p>
              <Link
                href="/"
                className="inline-block text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 font-medium"
              >
                Browse Sales →
              </Link>
            </div>
            <div className="mt-4 pt-4 border-t border-warm-200 dark:border-gray-600">
              <Link
                href="/calendar"
                className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 text-sm font-medium"
              >
                View Full Calendar →
              </Link>
            </div>
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

              {/* Streak widget — always visible when logged in */}
              <StreakWidget />

              {/* Achievements Badges */}
              {achievementsData?.achievements && achievementsData.achievements.length > 0 && !achievementsLoading && (
                <AchievementBadgesSection
                  achievements={achievementsData.achievements}
                  showStats={true}
                />
              )}

              <ActivitySummary />

              {/* Welcome nudge only shown when no purchases yet — positioned after stats for discoverability */}
              {purchases && purchases.length === 0 && (
                <EmptyState
                  icon="🎉"
                  heading="Welcome to FindA.Sale!"
                  subtext="Explore nearby sales, add your favorite items, and discover unique treasures. Ready to get started?"
                  cta={{ label: 'Browse Upcoming Sales', href: '/' }}
                />
              )}

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
