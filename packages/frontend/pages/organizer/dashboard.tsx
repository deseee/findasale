/**
 * Organizer Dashboard
 *
 * Main hub for organizers to view sales, manage items,
 * and track analytics and earnings.
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import useCountUp from '../../hooks/useCountUp';
import { TierGatedButton } from '../../components/TierGatedNav';
import SaleCard from '../../components/SaleCard';
import ReputationTier from '../../components/ReputationTier';
import OrganizerTierBadge from '../../components/OrganizerTierBadge';
import SaleQRCode from '../../components/SaleQRCode';
import FlashDealForm from '../../components/FlashDealForm';
import SocialPostGenerator from '../../components/SocialPostGenerator';
import OnboardingWizard from '../../components/OnboardingWizard';
import SimpleModePanel from '../../components/SimpleModePanel';
import SaleStatusWidget from '../../components/SaleStatusWidget';
import Head from 'next/head';
import Link from 'next/link';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import { AnimatedCounter } from '../../components/AnimatedCounter';

// Phase 22: Creator Tier benefits (frontend-only display)
const TIER_BENEFITS: Record<string, string[]> = {
  NEW: [
    'Basic listing on FindA.Sale',
    'Standard search placement',
    'Sale analytics dashboard',
  ],
  TRUSTED: [
    'Verified badge on all listings',
    'Priority placement in search results',
    'Advanced analytics & earnings reports',
    'Access to sale promotion tools',
  ],
  ESTATE_CURATOR: [
    'Featured placement on homepage',
    'Inclusion in the weekly curator newsletter',
    'Custom organizer profile page',
    'Dedicated seller support',
  ],
};

// Phase 31: Tier descriptions shown in the Tier Rewards card
const TIER_DESCRIPTIONS: Record<string, string> = {
  BRONZE: 'Starting tier for all organizers. Run sales and build your reputation.',
  SILVER: 'Awarded after consistently completing sales. Unlocks priority search placement and a verified badge.',
  GOLD: 'Top tier for high-volume organizers. Featured placement and dedicated support.',
};

// CollapsibleSection component for tier-aware dashboard sections
interface CollapsibleSectionProps {
  title: string;
  icon?: string;
  isLocked: boolean;
  lockedMessage: string;
  lockedTier?: string;
  children?: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  isLocked,
  lockedMessage,
  lockedTier = 'PRO',
  children,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen && !isLocked);

  if (isLocked) {
    return (
      <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 opacity-75">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span className="font-medium text-gray-600 dark:text-gray-400">
              {icon ? `${icon} ` : ''}{title}
            </span>
          </div>
          <svg className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
        {isOpen && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">{lockedMessage}</p>
            <Link
              href="/pricing"
              className="inline-block text-sm bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-full transition-colors font-medium"
            >
              Upgrade to {lockedTier}
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm font-semibold uppercase text-warm-600 dark:text-warm-400 hover:bg-warm-100 dark:hover:bg-gray-700 px-3 py-2 rounded transition-colors"
      >
        <svg className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
        {icon ? `${icon} ` : ''}{title}
      </button>
      {isOpen && <div className="mt-3 ml-3 flex flex-wrap gap-4">{children}</div>}
    </div>
  );
};

const OrganizerDashboard = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { isSimple, canAccess } = useOrganizerTier();
  const [isClient, setIsClient] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'sales'>('overview');
  const [openQRSale, setOpenQRSale] = useState<string | null>(null);
  const [flashDealSaleId, setFlashDealSaleId] = useState<string | null>(null);
  const [socialPostSale, setSocialPostSale] = useState<{ id: string; title: string } | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [showSaleSelector, setShowSaleSelector] = useState(false);
  const [isSimpleMode, setIsSimpleMode] = useState(false);
  const [showTierTools, setShowTierTools] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [showUpgradeCTA, setShowUpgradeCTA] = useState(true);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch organizer's sales
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['organizer-sales', user?.id],
    queryFn: async () => {
      const response = await api.get('/sales/mine');
      return response.data.sales;
    },
    enabled: !!user?.id && isClient,
  });

  // Fetch organizer analytics (total items, revenue)
  const { data: analyticsData } = useQuery({
    queryKey: ['organizer-analytics', user?.id],
    queryFn: async () => {
      const response = await api.get('/organizers/me/analytics');
      return response.data;
    },
    enabled: !!user?.id && isClient,
  });

  // Feature #79: Count-up animation for earnings total
  const animatedRevenue = useCountUp(analyticsData?.totalRevenue || 0, 1200);

  // Phase 22: Fetch organizer tier + progress data
  const { data: orgProfile } = useQuery({
    queryKey: ['organizer-me'],
    queryFn: async () => {
      const response = await api.get('/organizers/me');
      return response.data as {
        reputationTier: string;
        progressMessage: string;
        completedSales: number;
        followerCount: number;
        avgRating: number | null;
        onboardingComplete: boolean;
        subscriptionLapsed: boolean;
      };
    },
    enabled: !!user?.id && isClient,
  });

  // Fetch earnings to check for cash fee balance
  const { data: earnings } = useQuery({
    queryKey: ['earnings-breakdown'],
    queryFn: async () => {
      const response = await api.get('/stripe/earnings');
      return response.data as {
        cashFeeBalance?: number;
        cashFeeBalanceUpdatedAt?: string;
      };
    },
    enabled: !!user?.id && isClient,
    staleTime: 2 * 60_000,
  });

  // #24: Fetch active hold count for dashboard badge
  const { data: holdCountData } = useQuery({
    queryKey: ['organizer-hold-count', user?.id],
    queryFn: async () => {
      const response = await api.get('/reservations/organizer/count');
      return response.data as { count: number };
    },
    enabled: !!user?.id && isClient,
    staleTime: 60_000,
  });

  // Read simple mode preference from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const simpleModeSaved = localStorage.getItem('findasale_simple_mode');
    if (simpleModeSaved === 'true') {
      setIsSimpleMode(true);
    }
  }, []);

  // Detect mobile view (md breakpoint is 768px)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    setIsMobileView(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobileView(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Show wizard if onboarding not complete (and not dismissed via localStorage)
  useEffect(() => {
    if (orgProfile && !orgProfile.onboardingComplete) {
      const wizardSeen = localStorage.getItem('onboarding_wizard_seen');
      if (!wizardSeen) {
        setShowWizard(true);
      }
    }
  }, [orgProfile]);

  // Load upgrade CTA dismiss state from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ctaDismissed = localStorage.getItem('organizer_upgrade_cta_dismissed');
    if (ctaDismissed) {
      setShowUpgradeCTA(false);
    }
  }, []);

  // Handle Stripe checkout success redirect
  useEffect(() => {
    if (router.query.upgrade === 'success' && user?.organizerTier) {
      const tierName = user.organizerTier === 'PRO' ? 'PRO' : 'TEAMS';
      showToast(`You're now on ${tierName}! Welcome to an upgraded experience.`, 'success');
      // Clear the query param from URL
      router.replace(router.pathname, undefined, { shallow: true });
    }
  }, [router.query.upgrade, user?.organizerTier, router, showToast]);

  // Handle sale cloning
  const handleCloneSale = async (saleId: string) => {
    setCloningId(saleId);
    try {
      const response = await api.post(`/sales/${saleId}/clone`);
      const newSaleId = response.data.id;
      router.push(`/organizer/edit-sale/${newSaleId}`);
    } catch (error: any) {
      console.error('Clone failed:', error);
      showToast(error.response?.data?.message || 'Failed to clone sale', 'error');
    } finally {
      setCloningId(null);
    }
  };

  // Phase 31: Fetch organizer tier rewards (tier, benefits, progress)
  const { data: tierData } = useQuery({
    queryKey: ['my-tier', user?.id],
    queryFn: async () => {
      const response = await api.get('/tiers/mine');
      return response.data as {
        tier: 'BRONZE' | 'SILVER' | 'GOLD';
        benefits: {
          feePct: number;
          auctionFeePct: number;
          label: string;
          perks: string[];
        };
        progress: {
          currentTier: 'BRONZE' | 'SILVER' | 'GOLD';
          nextTier: 'BRONZE' | 'SILVER' | 'GOLD' | null;
          completedSales: number;
          soldItems: number;
          salesNeeded: number;
          itemsNeeded: number;
        };
      };
    },
    enabled: !!user?.id && isClient,
  });

  // Auth guard — after all hooks
  if (!authLoading && (!user || !(user.roles?.includes('ORGANIZER') || user.role === 'ORGANIZER' || user.role === 'ADMIN'))) {
    router.push('/access-denied');
    return null;
  }

  const isLoading = !isClient || authLoading || salesLoading;

  // Helper: Check if cash fee is stale (> 30 days)
  const isCashFeeStale = (): boolean => {
    if (!earnings?.cashFeeBalanceUpdatedAt) return false;
    const updated = new Date(earnings.cashFeeBalanceUpdatedAt);
    const now = new Date();
    const daysDiff = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff > 30;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <Skeleton className="h-10 w-64 mb-4" />
          <Skeleton className="h-6 w-96 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const cashFeeBalance = earnings?.cashFeeBalance ?? 0;

  return (
    <>
      <Head>
        <title>Organizer Dashboard - FindA.Sale</title>
      </Head>

      {/* Onboarding Wizard */}
      {showWizard && !orgProfile?.onboardingComplete && (
        <OnboardingWizard
          onComplete={() => {
            setShowWizard(false);
            localStorage.setItem('onboarding_wizard_seen', 'true');
          }}
        />
      )}

      {/* Social Post Generator modal */}
      {socialPostSale && (
        <SocialPostGenerator
          saleId={socialPostSale.id}
          saleTitle={socialPostSale.title}
          onClose={() => setSocialPostSale(null)}
        />
      )}

      {/* Simple Mode View */}
      {isSimpleMode && (
        <SimpleModePanel
          onExitSimpleMode={() => {
            setIsSimpleMode(false);
            localStorage.setItem('findasale_simple_mode', 'false');
          }}
        />
      )}

      {/* Full Dashboard */}
      {!isSimpleMode && (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Welcome, {user?.name?.split(' ')[0] || user?.name || 'there'}</h1>
            <p className="text-warm-600 dark:text-warm-400">Manage your sales and track earnings.</p>
          </div>

          {/* Welcome banner for newly converted organizers */}
          {router.query.welcome === 'true' && (
            <div className="bg-green-50 dark:bg-green-900/20 border-l-4 border-green-400 dark:border-green-600 p-4 mb-4 rounded">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800 dark:text-green-200">
                    Welcome to your organizer dashboard!
                  </h3>
                  <div className="mt-2 text-sm text-green-700 dark:text-green-300">
                    <p>You can now list items for sale on FindA.Sale. Start by creating your first sale below.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Feature #75: Tier Lapse Banner */}
          {orgProfile?.subscriptionLapsed && (
            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 dark:border-red-600 p-4 mb-4 rounded">
              <div className="flex items-start justify-between">
                <div className="flex items-start flex-1">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800 dark:text-red-200">
                      Your PRO subscription has lapsed
                    </h3>
                    <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                      <p>You've been downgraded to SIMPLE tier (200 items/sale, 5 photos/item, 100 AI tags/month).</p>
                    </div>
                    <div className="mt-4">
                      <Link href="/organizer/billing" className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-300 underline">
                        Reactivate subscription →
                      </Link>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { localStorage.setItem('tier_lapse_banner_dismissed', 'true'); window.location.reload(); }}
                  className="text-red-400 hover:text-red-600 dark:hover:text-red-300"
                  aria-label="Dismiss banner"
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons - Grouped Sections */}
          <div className="space-y-3 mb-4">
            {/* Section 1: Quick Actions (always visible) */}
            <div>
              <h3 className="text-xs font-semibold text-warm-500 dark:text-warm-400 uppercase tracking-wide mb-2">Quick Actions</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <Link
                  href="/organizer/create-sale"
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  + Create New Sale
                </Link>
                <div className="relative">
                  <button
                    onClick={() => {
                      if (salesData && salesData.length > 0) {
                        if (salesData.length === 1) {
                          router.push(`/organizer/add-items/${salesData[0].id}`);
                        } else {
                          setShowSaleSelector(!showSaleSelector);
                        }
                      } else {
                        showToast('Please create a sale first', 'error');
                      }
                    }}
                    className="bg-warm-200 dark:bg-gray-700 hover:bg-warm-300 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 font-bold py-2 px-6 rounded-lg transition-colors"
                  >
                    📦 Add Items
                  </button>
                  {showSaleSelector && salesData && salesData.length > 1 && (
                    <div className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 border border-warm-300 dark:border-gray-700 rounded-lg shadow-lg z-50">
                      {salesData.map((sale: any) => (
                        <button
                          key={sale.id}
                          onClick={() => {
                            router.push(`/organizer/add-items/${sale.id}`);
                            setShowSaleSelector(false);
                          }}
                          className="block w-full text-left px-4 py-2 hover:bg-warm-50 dark:hover:bg-gray-700 text-warm-900 dark:text-warm-100 text-sm border-b border-warm-100 dark:border-gray-700 last:border-b-0 transition-colors"
                        >
                          {sale.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Link
                  href="/organizer/holds"
                  className="relative bg-amber-100 hover:bg-amber-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-amber-900 dark:text-amber-100 font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  🤝 Holds
                  {(holdCountData?.count ?? 0) > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full h-5 min-w-[1.25rem] flex items-center justify-center px-1">
                      {holdCountData!.count}
                    </span>
                  )}
                </Link>
                <button
                  onClick={() => {
                    if (salesData && salesData.length > 0) {
                      if (salesData.length === 1) {
                        router.push(`/organizer/sales/${salesData[0].id}`);
                      } else {
                        router.push('/organizer/sales');
                      }
                    } else {
                      showToast('Please create a sale first', 'error');
                    }
                  }}
                  className="bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 font-bold py-2 px-6 rounded-lg border border-warm-300 dark:border-gray-600 transition-colors"
                >
                  📋 Manage Sales
                </button>
                <Link
                  href="/organizer/pos"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  💳 POS
                </Link>
              </div>
            </div>

            {/* Calendar Widget - Upcoming Sales */}
            <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100">📅 Upcoming Sales</h3>
              </div>
              {salesData && salesData.length > 0 ? (
                <>
                  {(() => {
                    const now = new Date();
                    const upcomingSales = salesData
                      .filter((sale: any) => {
                        const saleStart = new Date(sale.startDate);
                        return saleStart > now && (sale.status === 'PUBLISHED' || sale.status === 'ACTIVE');
                      })
                      .sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
                      .slice(0, 3);

                    if (upcomingSales.length > 0) {
                      return (
                        <div className="space-y-2">
                          {upcomingSales.map((sale: any) => (
                            <div key={sale.id} className="flex justify-between items-center p-2 bg-warm-50 dark:bg-gray-700 rounded-md">
                              <p className="font-medium text-warm-900 dark:text-warm-100">{sale.title}</p>
                              <p className="text-sm text-warm-600 dark:text-warm-400">
                                {new Date(sale.startDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: new Date(sale.startDate).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                                })}
                              </p>
                            </div>
                          ))}
                        </div>
                      );
                    } else {
                      return (
                        <div className="text-center py-4">
                          <p className="text-warm-600 dark:text-warm-400 mb-4">No upcoming sales</p>
                          <Link
                            href="/organizer/create-sale"
                            className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                          >
                            Create Sale →
                          </Link>
                        </div>
                      );
                    }
                  })()}
                  <div className="mt-4 pt-4 border-t border-warm-200 dark:border-gray-600">
                    <Link
                      href="/calendar"
                      className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 text-sm font-medium"
                    >
                      View Full Calendar →
                    </Link>
                  </div>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-warm-600 dark:text-warm-400 mb-4">No sales yet</p>
                  <Link
                    href="/organizer/create-sale"
                    className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                  >
                    Create Sale →
                  </Link>
                </div>
              )}
            </div>

            {/* Your Tier Widget - Compact Reputation Status */}
            {tierData && (
              <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-warm-900 dark:text-warm-100">Your Tier</h3>
                  <OrganizerTierBadge tier={tierData.tier} />
                </div>
                <p className="text-sm text-warm-600 dark:text-warm-400 mb-3">{tierData.benefits.label}</p>
                <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                  <div><p className="font-semibold text-warm-900 dark:text-warm-100">{orgProfile?.followerCount ?? 0}</p><p className="text-xs text-warm-500 dark:text-warm-400">Followers</p></div>
                  <div><p className="font-semibold text-warm-900 dark:text-warm-100">{orgProfile?.avgRating ? orgProfile.avgRating.toFixed(1) : '—'}</p><p className="text-xs text-warm-500 dark:text-warm-400">Avg Rating</p></div>
                </div>
                <Link href={`/organizers/${user?.id}`} className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 text-xs font-semibold">
                  View Reputation →
                </Link>
              </div>
            )}

            {/* Section 2: Selling Tools (always available in SIMPLE+) */}
            <CollapsibleSection
              title="Selling Tools"
              icon="🛠️"
              isLocked={false}
              lockedMessage=""
              defaultOpen={true}
            >
              <Link
                href="/organizer/holds"
                className="relative bg-amber-100 hover:bg-amber-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-amber-900 dark:text-amber-100 font-bold py-2 px-6 rounded-lg transition-colors"
              >
                🤝 Holds
                {(holdCountData?.count ?? 0) > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-bold rounded-full h-5 min-w-[1.25rem] flex items-center justify-center px-1">
                    {holdCountData!.count}
                  </span>
                )}
              </Link>
              <Link
                href="/organizer/pos"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                💳 POS / Checkout
              </Link>
              <Link
                href="/organizer/print-inventory"
                className="bg-purple-100 hover:bg-purple-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-purple-900 dark:text-purple-100 font-bold py-2 px-6 rounded-lg transition-colors"
              >
                🖨️ Print Inventory
              </Link>
              <Link
                href="/organizer/sale-map"
                className="bg-cyan-100 hover:bg-cyan-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-cyan-900 dark:text-cyan-100 font-bold py-2 px-6 rounded-lg transition-colors"
              >
                🗺️ Sale Map
              </Link>
              <Link
                href="/organizer/qr"
                className="bg-blue-100 hover:bg-blue-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-blue-900 dark:text-blue-100 font-bold py-2 px-6 rounded-lg transition-colors"
              >
                📱 QR Codes
              </Link>
            </CollapsibleSection>

            {/* Section 3: Analytics & Performance (SIMPLE+) */}
            <CollapsibleSection
              title="Analytics & Performance"
              icon="📊"
              isLocked={!canAccess('SIMPLE')}
              lockedMessage="Upgrade to Simple to unlock Analytics & Earnings"
              lockedTier="SIMPLE"
              defaultOpen={canAccess('SIMPLE')}
            >
              <TierGatedButton
                href="/organizer/insights"
                label="Analytics"
                icon="📊"
                requiredTier="SIMPLE"
                className="bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100"
              />
              <TierGatedButton
                href="/organizer/payouts"
                label="Earnings"
                icon="💰"
                requiredTier="SIMPLE"
                className="bg-green-100 hover:bg-green-200 dark:bg-green-900/30 text-green-900 dark:text-green-100"
              />
              <TierGatedButton
                href="/organizer/ripples"
                label="Sale Ripples"
                icon="🌊"
                requiredTier="SIMPLE"
                className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100"
              />
            </CollapsibleSection>

            {/* Section 4: Pro Tools (PRO+) */}
            <CollapsibleSection
              title="Pro Tools"
              icon="🚀"
              isLocked={!canAccess('PRO')}
              lockedMessage="Upgrade to Pro to unlock Brand Kit, Flip Report & more"
              lockedTier="PRO"
              defaultOpen={canAccess('PRO')}
            >
              <TierGatedButton
                href="/organizer/brand-kit"
                label="Brand Kit"
                icon="🎨"
                requiredTier="PRO"
                className="bg-pink-100 hover:bg-pink-200 dark:bg-pink-900/30 text-pink-900 dark:text-pink-100"
              />
              <TierGatedButton
                href="/organizer/flip-report"
                label="Flip Report"
                icon="📈"
                requiredTier="PRO"
                className="bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/30 text-rose-900 dark:text-rose-100"
              />
              <TierGatedButton
                href="/organizer/item-tagger"
                label="Item Tagger"
                icon="🏷️"
                requiredTier="PRO"
                className="bg-cyan-100 hover:bg-cyan-200 dark:bg-cyan-900/30 text-cyan-900 dark:text-cyan-100"
              />
              {canAccess('TEAMS') && (
                <TierGatedButton
                  href="/organizer/webhooks"
                  label="Webhooks"
                  icon="🔗"
                  requiredTier="TEAMS"
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/30 text-slate-900 dark:text-slate-100"
                />
              )}
            </CollapsibleSection>

            {/* Section 5: Staff & Collaboration (TEAMS) */}
            <CollapsibleSection
              title="Staff & Collaboration"
              icon="👥"
              isLocked={!canAccess('TEAMS')}
              lockedMessage="Upgrade to Teams to unlock Staff Accounts & collaboration tools"
              lockedTier="TEAMS"
              defaultOpen={canAccess('TEAMS')}
            >
              <TierGatedButton
                href="/organizer/staff"
                label="Staff Accounts"
                icon="👤"
                requiredTier="TEAMS"
                className="bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100"
              />
              <TierGatedButton
                href="/organizer/sale-hubs"
                label="Sale Hubs"
                icon="🏢"
                requiredTier="TEAMS"
                className="bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100"
              />
              <TierGatedButton
                href="/organizer/virtual-queue"
                label="Virtual Queue"
                icon="📋"
                requiredTier="TEAMS"
                className="bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100"
              />
            </CollapsibleSection>

            {/* Community Links (open by default) */}
            <CollapsibleSection
              title="Community"
              icon="🌍"
              isLocked={false}
              lockedMessage=""
              defaultOpen={true}
            >
              <Link
                href="/organizer/bounties"
                className="bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100 font-bold py-2 px-6 rounded-lg transition-colors"
              >
                🏆 Bounties
              </Link>
              <Link
                href="/organizer/reputation"
                className="bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100 font-bold py-2 px-6 rounded-lg transition-colors"
              >
                ⭐ Reputation
              </Link>
              {canAccess('PRO') && (
                <Link
                  href="/neighborhoods"
                  className="bg-teal-100 hover:bg-teal-200 dark:bg-teal-900/30 text-teal-900 dark:text-teal-100 font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  🏘️ Neighborhoods
                </Link>
              )}
            </CollapsibleSection>

            {/* Section 5: Upgrade CTA for SIMPLE tier */}
            {isSimple && showUpgradeCTA && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg mt-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🔒</span>
                  <div className="flex-1">
                    <p className="font-semibold text-amber-900 dark:text-amber-100">Unlock Pro Features</p>
                    <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                      Save time. Understand what sells. Build a brand that brings shoppers back.
                    </p>
                    <Link
                      href="/pricing?source=dashboard"
                      className="inline-block mt-3 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                    >
                      Upgrade to PRO
                    </Link>
                  </div>
                  <button
                    onClick={() => {
                      setShowUpgradeCTA(false);
                      localStorage.setItem('organizer_upgrade_cta_dismissed', 'true');
                    }}
                    className="text-warm-400 hover:text-warm-600 dark:text-warm-500 dark:hover:text-warm-400 text-xl flex-shrink-0"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-4 mb-4 border-b border-warm-200 dark:border-gray-700">
            {(['overview', 'sales'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 font-medium capitalize ${
                  activeTab === tab
                    ? 'border-b-2 border-amber-600 text-amber-600'
                    : 'text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Content */}
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="card p-4">
                  <p className="text-warm-600 dark:text-warm-300 text-sm">Active Sales</p>
                  <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{salesData?.filter((s: any) => s.status === 'PUBLISHED').length || 0}</p>
                </div>
                <div className="card p-6">
                  <p className="text-warm-600 dark:text-warm-300 text-sm">Total Items</p>
                  <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{(analyticsData?.itemsSold ?? 0) + (analyticsData?.itemsUnsold ?? 0)}</p>
                </div>
                <div className="card p-6">
                  <p className="text-warm-600 dark:text-warm-300 text-sm">Total Revenue</p>
                  <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">
                    <AnimatedCounter value={analyticsData?.totalRevenue || 0} prefix="$" duration={800} decimals={2} />
                  </p>
                </div>
              </div>

              {/* Cash Fee Balance card */}
              {cashFeeBalance > 0 && (
                <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Cash Fee Balance</p>
                      <p className="text-2xl font-bold text-amber-900 mt-1">${cashFeeBalance.toFixed(2)}</p>
                      {earnings?.cashFeeBalanceUpdatedAt && (
                        <p className="text-xs text-amber-700 mt-1">
                          Last updated: {new Date(earnings.cashFeeBalanceUpdatedAt).toLocaleDateString()}
                        </p>
                      )}
                      {isCashFeeStale() && (
                        <p className="text-xs text-amber-700 mt-2 italic">⚠️ This balance is 30+ days old and will be deducted from your next payout.</p>
                      )}
                    </div>
                    <Link
                      href="/organizer/payouts"
                      className="text-sm font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap ml-4"
                    >
                      View Payouts →
                    </Link>
                  </div>
                </div>
              )}

              {/* H1: How It Works card */}
              {orgProfile && !orgProfile.onboardingComplete && !showWizard && (
                <div className="bg-white dark:bg-gray-800 dark:shadow-gray-900/50 rounded-lg shadow-md p-6 mb-4">
                  <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">How It Works</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center mx-auto mb-3"><span className="text-xl">📋</span></div>
                      <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm mb-1">1. Create a Sale</p>
                      <p className="text-xs text-warm-600 dark:text-warm-400">Set your date, location, and sale details to get started.</p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center mx-auto mb-3"><span className="text-xl">📷</span></div>
                      <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm mb-1">2. Add Your Items</p>
                      <p className="text-xs text-warm-600 dark:text-warm-400">Snap photos and set prices. AI helps tag and describe items.</p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center mx-auto mb-3"><span className="text-xl">🛒</span></div>
                      <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm mb-1">3. Attract Buyers</p>
                      <p className="text-xs text-warm-600 dark:text-warm-400">Your sale goes live on the map. Buyers browse, search, and save items.</p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center mx-auto mb-3"><span className="text-xl">💰</span></div>
                      <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm mb-1">4. Complete the Sale</p>
                      <p className="text-xs text-warm-600 dark:text-warm-400">Accept offers, process payments, and track your earnings.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Phase 22: Creator Tier card */}
              {orgProfile && (
                <div className="bg-white dark:bg-gray-800 dark:shadow-gray-900/50 rounded-lg shadow-md p-6 mb-4">
                  <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-3">Creator Tier</h3>
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <ReputationTier tier={orgProfile.reputationTier} size="sm" />
                    <p className="text-sm text-warm-600 dark:text-warm-400">{orgProfile.progressMessage}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                    <div><p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{orgProfile.completedSales}</p><p className="text-xs text-warm-500 dark:text-warm-400">Completed Sales</p></div>
                    <div><p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{orgProfile.followerCount}</p><p className="text-xs text-warm-500 dark:text-warm-400">Followers</p></div>
                    <div><p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{orgProfile.avgRating ? orgProfile.avgRating.toFixed(1) : '—'}</p><p className="text-xs text-warm-500 dark:text-warm-400">Avg Rating</p></div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-warm-500 dark:text-warm-400 uppercase tracking-wide mb-2">Your tier benefits</p>
                    <ul className="space-y-1">
                      {(TIER_BENEFITS[orgProfile.reputationTier] || TIER_BENEFITS.NEW).map((benefit) => (
                        <li key={benefit} className="flex items-center gap-2 text-sm text-warm-700 dark:text-warm-300">
                          <span className="text-green-500 dark:text-green-400 flex-shrink-0">✓</span>{benefit}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Link
                    href="/organizer/reputation"
                    className="inline-block mt-4 text-sm font-semibold text-amber-600 hover:text-amber-700"
                  >
                    View Full Reputation Score →
                  </Link>
                </div>
              )}

              {/* Plan a Sale Coming Soon Card */}
              <div className="bg-white dark:bg-gray-800 dark:shadow-gray-900/50 rounded-lg shadow-md p-6 mb-4 border border-warm-100 dark:border-gray-700">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">📋</span>
                    <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100">Plan a Sale</h3>
                  </div>
                  <span className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full px-3 py-1 text-xs font-semibold flex-shrink-0">
                    Coming Soon
                  </span>
                </div>
                <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
                  Get organized before your sale. Plan a Sale will help you create checklists, build timelines, and organize all your prep tasks so nothing gets missed.
                </p>
                <p className="text-xs text-warm-500 dark:text-warm-500 italic">
                  This feature is coming to all organizers soon.
                </p>
              </div>
            </>
          )}

          {activeTab === 'sales' && (
            <>
              {salesLoading ? (
                <p>Loading your sales...</p>
              ) : salesData && salesData.length > 0 ? (
                <div className="space-y-8">
                  {salesData.map((sale: any) => (
                    <div key={sale.id}>
                      <div className="card overflow-hidden hover:shadow-lg transition-shadow">
                        <div className="p-4">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100">{sale.title}</h3>
                            {sale.status === 'PUBLISHED' ? (
                              <span className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full px-2 py-0.5 text-xs font-semibold flex-shrink-0">● LIVE</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-full px-2 py-0.5 text-xs font-semibold flex-shrink-0">◌ DRAFT</span>
                            )}
                          </div>
                          <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">{sale.city}, {sale.state}</p>
                          <div className="flex gap-2 flex-wrap items-center">
                            <Link href={`/sales/${sale.id}`} className="text-sm text-amber-600 hover:underline font-semibold">View Sale</Link>
                            <Link href={`/organizer/edit-sale/${sale.id}`} className="text-sm text-amber-600 hover:underline">Edit</Link>
                            <Link href={`/organizer/add-items/${sale.id}`} className="text-sm text-amber-600 hover:underline">Items</Link>
                            <button onClick={() => setOpenQRSale(openQRSale === sale.id ? null : sale.id)} className="text-sm text-amber-600 hover:underline">{openQRSale === sale.id ? 'Hide QR' : 'QR Code'}</button>
                            <button onClick={() => handleCloneSale(sale.id)} disabled={cloningId === sale.id} className="text-sm text-amber-600 hover:underline disabled:opacity-50">{cloningId === sale.id ? 'Cloning...' : 'Clone'}</button>
                            {canAccess('PRO') && (
                              <button onClick={() => setFlashDealSaleId(flashDealSaleId === sale.id ? null : sale.id)} className="text-sm text-red-600 hover:underline font-semibold">{flashDealSaleId === sale.id ? 'Cancel Deal' : '⚡ Flash Deal'}</button>
                            )}
                            <button onClick={() => setSocialPostSale({ id: sale.id, title: sale.title })} className="text-sm text-sage-600 hover:underline font-semibold">📣 Share</button>
                          </div>
                          {openQRSale === sale.id && (
                            <div className="mt-4 pt-4 border-t border-warm-100">
                              <SaleQRCode saleId={sale.id} saleTitle={sale.title} size={160} />
                            </div>
                          )}
                          {flashDealSaleId === sale.id && sale.items && (
                            <div className="mt-4 pt-4 border-t border-warm-100">
                              <FlashDealForm saleId={sale.id} saleItems={sale.items} onSuccess={() => setFlashDealSaleId(null)} onCancel={() => setFlashDealSaleId(null)} />
                            </div>
                          )}
                        </div>
                      </div>
                      {sale.status === 'PUBLISHED' && (
                        <div className="mt-4">
                          <SaleStatusWidget saleId={sale.id} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon="🏷️" heading="You haven't created any sales yet" subtext="Start by creating your first sale. Set up details, add inventory, and go live!" cta={{ label: 'Create Your First Sale', href: '/organizer/create-sale' }} />
              )}
            </>
          )}
        </div>
      </div>
      )}
    </>
  );
};

export default OrganizerDashboard;
