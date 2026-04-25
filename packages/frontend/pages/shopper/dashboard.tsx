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
import RareFindsFeed from '../../components/RareFindsFeed'; // Hunt Pass: Rare Finds section
import Skeleton from '../../components/Skeleton';
import { useFollows } from '../../hooks/useFollows';
import BrandFollowManager from '../../components/BrandFollowManager';
import ClaimCard from '../../components/ClaimCard'; // Hold-to-Pay: Shopper pending payments
import useXpProfile from '../../hooks/useXpProfile';
import RankBadge, { ExplorerRank } from '../../components/RankBadge';
import RankProgressBar from '../../components/RankProgressBar';
import RankBenefitsCard from '../../components/RankBenefitsCard';
import PointsBadge from '../../components/PointsBadge';
import MyTeamsCard from '../../components/MyTeamsCard';
import RankHeroSection from '../../components/RankHeroSection';
import ActionBar from '../../components/ActionBar';
import ExplorerGuildOnboardingCard from '../../components/ExplorerGuildOnboardingCard';

const ShopperDashboard = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'subscribed' | 'pickups' | 'brands'>('overview');
  const [isHuntPassDismissed, setIsHuntPassDismissed] = useState(false);
  const [isReferralDismissed, setIsReferralDismissed] = useState(false);
  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [shopperQRCodeDataUrl, setShopperQRCodeDataUrl] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(true);
  const [showQrModal, setShowQrModal] = useState(false);
  const [hasSeenGuildOnboarding, setHasSeenGuildOnboarding] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  // Handle hash-based tab navigation on mount and when hash changes
  useEffect(() => {
    if (router.isReady && router.asPath.includes('#')) {
      const hash = router.asPath.split('#')[1];
      if (['overview', 'subscribed', 'pickups', 'brands'].includes(hash)) {
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

  // Load Referral dismissal state from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem('referral_cta_dismissed');
    if (dismissed) {
      setIsReferralDismissed(true);
    }
  }, []);

  // Load Explorer's Guild onboarding state from localStorage
  useEffect(() => {
    const seen = localStorage.getItem('explorer_guild_onboarded');
    if (seen) {
      setHasSeenGuildOnboarding(true);
    }
  }, []);

  // Load welcome card dismissal state from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem('finda_welcome_dismissed');
    if (dismissed === 'true') {
      setWelcomeDismissed(true);
    }
  }, []);

  // Fetch referral code
  useEffect(() => {
    if (user?.id && !isReferralDismissed) {
      const fetchReferralCode = async () => {
        try {
          const response = await api.get('/referrals/my-code');
          if (response.data?.code) {
            const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
            setReferralLink(`${baseUrl}/register?ref=${response.data.code}`);
          }
        } catch (error) {
          console.error('Failed to fetch referral code:', error);
        }
      };
      fetchReferralCode();
    }
  }, [user?.id, isReferralDismissed]);

  // Fetch shopper QR code
  useEffect(() => {
    if (user?.id) {
      const fetchQRCode = async () => {
        try {
          const response = await api.get(`/users/qr/${user.id}`);
          if (response.data?.qrCodeDataUrl) {
            setShopperQRCodeDataUrl(response.data.qrCodeDataUrl);
          }
        } catch (error) {
          console.error('Failed to fetch QR code:', error);
        }
      };
      fetchQRCode();
    }
  }, [user?.id]);

  const handleDismissHuntPass = () => {
    localStorage.setItem('huntpass_cta_dismissed', 'true');
    setIsHuntPassDismissed(true);
  };

  const handleDismissReferral = () => {
    localStorage.setItem('referral_cta_dismissed', 'true');
    setIsReferralDismissed(true);
  };

  const handleCopyReferralLink = () => {
    if (referralLink) {
      navigator.clipboard.writeText(referralLink).then(() => {
        alert('Referral link copied to clipboard!');
      });
    }
  };

  const handleDismissWelcome = () => {
    localStorage.setItem('finda_welcome_dismissed', 'true');
    setWelcomeDismissed(true);
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

  // Fetch XP profile for rank progress
  const { data: xpProfile, isLoading: xpLoading } = useXpProfile(!!user?.id);

  // Rank threshold configuration — must match backend xpService.ts RANK_THRESHOLDS
  const RANK_THRESHOLDS: Record<ExplorerRank, number> = {
    INITIATE: 0,
    SCOUT: 500,
    RANGER: 2000,
    SAGE: 5000,
    GRANDMASTER: 12000,
  };

  // Next rank thresholds (XP required to reach the next rank from current rank)
  const NEXT_RANK_THRESHOLDS: Record<ExplorerRank, number> = {
    INITIATE: 500,
    SCOUT: 2000,
    RANGER: 5000,
    SAGE: 12000,
    GRANDMASTER: 12000,
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
        progressLabel: `${xp} / 2000 XP`,
        untilNextRank: `${xpUntilNext} more XP until Ranger`,
        earnTip: 'Make a purchase (+25 XP each)',
        tipDetail: "You're unlocking more perks — keep going.",
        ctaText: 'View Your Sales',
        ctaHref: '/sales',
      },
      RANGER: {
        progressLabel: `${xp} / 5000 XP`,
        untilNextRank: `${xpUntilNext} more XP until Sage`,
        earnTip: 'Check in to sales daily (+2 XP each, once per sale)',
        tipDetail: "Daily visits build your streak. You're close to Sage perks.",
        ctaText: 'See Sales Near You',
        ctaHref: '/map',
      },
      SAGE: {
        progressLabel: `${xp} / 12000 XP`,
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
          {isNewShopper && !welcomeDismissed ? (
            // State A: New shopper
            <div className="relative bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-8 mb-8 text-center">
              <button
                onClick={handleDismissWelcome}
                className="absolute top-3 right-3 text-warm-400 dark:text-warm-600 hover:text-warm-600 dark:hover:text-warm-400 transition-colors"
                aria-label="Dismiss welcome card"
              >
                ×
              </button>
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
            </div>
          )}

          {/* 1. Rank/XP Hero Card */}
          <div className="mb-8">
            {xpProfile && !xpLoading ? (
              <RankHeroSection
                rank={xpProfile.explorerRank}
                guildXp={xpProfile.guildXp}
                xpToNext={NEXT_RANK_THRESHOLDS[xpProfile.explorerRank]}
                xpPercent={(xpProfile.rankProgress.currentXp / NEXT_RANK_THRESHOLDS[xpProfile.explorerRank]) * 100}
                userName={user?.firstName || user?.name || 'Explorer'}
              />
            ) : (
              <Skeleton className="h-64" />
            )}
          </div>

          {/* 1a. QR expanded panel (immediately below RankHeroSection, only when qrOpen === true) */}
          {shopperQRCodeDataUrl && qrOpen && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-6 mb-8 w-full">
              <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
                Show this to the organizer at checkout to instantly load your active holds and cart items.
              </p>
              <div className="flex justify-center mb-4">
                <img
                  src={shopperQRCodeDataUrl}
                  alt="Your personal QR code for checkout"
                  className="w-48 h-48 border-2 border-warm-200 dark:border-gray-600 rounded-lg"
                />
              </div>
              <p className="text-xs text-warm-500 dark:text-warm-500 text-center">
                Scan to verify your account and active holds at POS
              </p>
            </div>
          )}

          {/* QR Modal */}
          {showQrModal && shopperQRCodeDataUrl && (
            <div
              className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4"
              onClick={() => setShowQrModal(false)}
            >
              <div
                className="bg-gray-900 dark:bg-gray-950 rounded-lg p-6 max-w-sm w-full shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-white">Your QR Code</h2>
                  <button
                    onClick={() => setShowQrModal(false)}
                    className="p-1 rounded-md text-gray-400 hover:text-white transition-colors"
                    aria-label="Close QR modal"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <div className="flex justify-center mb-6">
                  <img
                    src={shopperQRCodeDataUrl}
                    alt="Your personal QR code for checkout"
                    className="w-56 h-56 border-4 border-amber-600 rounded-lg"
                  />
                </div>
                <p className="text-center text-sm text-gray-300">
                  Show this to the organizer at checkout
                </p>
              </div>
            </div>
          )}

          {/* 1b. Explorer's Guild Onboarding Card (for INITIATE users) */}
          {xpProfile && xpProfile.explorerRank === 'INITIATE' && !hasSeenGuildOnboarding && (
            <ExplorerGuildOnboardingCard
              onDismiss={() => setHasSeenGuildOnboarding(true)}
            />
          )}

          {/* 2. Action buttons row (Browse Sales, Collections, Purchase History, Treasure Trails, My QR) */}
          <ActionBar className="mb-8" onQrClick={() => setShowQrModal(true)} />

          {/* 4. Hunt Pass CTA strip (keep it slim) */}
          {user && xpProfile && !user.huntPassActive && xpProfile.explorerRank !== 'GRANDMASTER' && (
            <div className="flex items-center justify-between bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg px-4 py-3 mb-6">
              <span className="text-sm text-purple-800 dark:text-purple-200">
                ⭐ <strong>Hunt Pass</strong> — earn 1.5x XP on every purchase
              </span>
              <Link
                href="/shopper/hunt-pass"
                className="text-sm font-semibold text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 whitespace-nowrap ml-4"
              >
                $4.99/mo →
              </Link>
            </div>
          )}


          {/* Tabs */}
          <div className="flex gap-2 mb-8 border-b border-warm-200 dark:border-gray-700 overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview' },
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
              {/* Achievements now live on /shopper/explorer-profile only (S540 dedup) */}

              {/* Hold-to-Pay: Pending Payments Section — Priority #1 */}
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

              {/* Your Collections — Priority #2 (after pending payments) */}
              <YourWishlists />

              {/* Recently Viewed */}
              <RecentlyViewed />

              {/* My Teams Card */}
              <MyTeamsCard />

              {/* Hunt Pass Active Badge */}
              {user && user.huntPassActive && (
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl">✅</span>
                    <div className="flex-1">
                      <h3 className="font-semibold text-purple-900 dark:text-purple-300 mb-1">Hunt Pass Active</h3>
                      <p className="text-sm text-purple-800 dark:text-purple-200">You're earning 1.5x XP on every action and get early access to Rare and Legendary items!</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Rare Finds Feed — Hunt Pass only */}
              {userData && userData.huntPassActive && (
                <RareFindsFeed />
              )}

              <ActivitySummary />

              {/* SalesNearYou hidden per Patrick feedback — feature not working */}
              {false && <SalesNearYou />}

              <FlashDealsBanner />
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

          {/* Brands Tab */}
          {activeTab === 'brands' && (
            <div>
              <BrandFollowManager />
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default ShopperDashboard;