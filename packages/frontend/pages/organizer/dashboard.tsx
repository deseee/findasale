/**
 * Organizer Dashboard — Redesigned S350
 *
 * State-aware dashboard for organizers showing:
 * - State 1: New organizer (0 sales) — welcome hero + 3-step path + benefits
 * - State 2: Active organizer (DRAFT or PUBLISHED sale) — sale status widget + quick actions + tier progress
 * - State 3: Between sales (all ENDED) — congratulations + past sales archive
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
import OrganizerOnboardingModal from '../../components/OrganizerOnboardingModal';
import SimpleModePanel from '../../components/SimpleModePanel';
import SaleStatusWidget from '../../components/SaleStatusWidget';
import Head from 'next/head';
import Link from 'next/link';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import { AnimatedCounter } from '../../components/AnimatedCounter';

// Selling Tools grid configuration (6 tools, tier-gated)
const SELLING_TOOLS = [
  { label: 'Create Sale', icon: '📋', href: '/organizer/create-sale', requiredTier: null },
  { label: 'Add Items', icon: '📷', href: (saleId: string) => `/organizer/add-items/${saleId}`, requiredTier: null },
  { label: 'QR Codes', icon: '📱', href: '/organizer/qr', requiredTier: null },
  { label: 'POS Checkout', icon: '💳', href: '/organizer/pos', requiredTier: null },
  { label: 'Print Inventory', icon: '🖨️', href: '/organizer/print-inventory', requiredTier: 'PRO' },
  { label: 'Analytics', icon: '📊', href: '/organizer/insights', requiredTier: 'SIMPLE' },
];

type DashboardState = 'new' | 'active' | 'between';

interface Sale {
  id: string;
  title: string;
  status: string; // DRAFT, PUBLISHED, ENDED
  startDate: string;
  endDate: string;
  photoUrls: string[];
  city: string;
  state: string;
}

const OrganizerDashboard = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { isSimple, canAccess } = useOrganizerTier();
  const [isClient, setIsClient] = useState(false);
  const [openQRSale, setOpenQRSale] = useState<string | null>(null);
  const [flashDealSaleId, setFlashDealSaleId] = useState<string | null>(null);
  const [socialPostSale, setSocialPostSale] = useState<{ id: string; title: string } | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [isSimpleMode, setIsSimpleMode] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [showUpgradeCTA, setShowUpgradeCTA] = useState(true);

  useEffect(() => {
    setIsClient(true);
    // Show onboarding modal once for new organizers
    if (!localStorage.getItem('onboardingModalDismissed')) {
      setShowOnboardingModal(true);
    }
  }, []);

  // Fetch organizer's sales
  const { data: salesData = [], isLoading: salesLoading } = useQuery<Sale[]>({
    queryKey: ['organizer-sales', user?.id],
    queryFn: async () => {
      const response = await api.get('/sales/mine');
      return response.data.sales || [];
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

  // Fetch consolidated dashboard stats (revenue, items, active sale metrics)
  const { data: statsData } = useQuery({
    queryKey: ['organizer-stats', user?.id],
    queryFn: async () => {
      const response = await api.get('/organizers/stats');
      return response.data as {
        revenue: {
          totalLifetime: number;
          currentSale: number;
          thisMonth: number;
        };
        items: {
          total: number;
          available: number;
          sold: number;
          draft: number;
        };
        activeSale: {
          id: string;
          title: string;
          viewCount: number;
          holdCount: number;
        } | null;
      };
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

  // Determine dashboard state based on sales
  const getDashboardState = (): DashboardState => {
    if (!salesData || salesData.length === 0) return 'new';
    const hasActiveSale = salesData.some((s: Sale) => s.status === 'DRAFT' || s.status === 'PUBLISHED');
    if (hasActiveSale) return 'active';
    return 'between';
  };

  const dashboardState = getDashboardState();

  // Get the current active sale (for State 2)
  const getActiveSale = (): Sale | null => {
    if (!salesData) return null;
    // Prefer PUBLISHED over DRAFT
    let sale = salesData.find((s: Sale) => s.status === 'PUBLISHED');
    if (!sale) sale = salesData.find((s: Sale) => s.status === 'DRAFT');
    return sale || null;
  };

  const activeSale = dashboardState === 'active' ? getActiveSale() : null;

  // Helper: Check if sale is ending soon (<24h)
  const isEndingSoon = (sale: Sale): boolean => {
    if (!sale?.endDate) return false;
    const now = new Date();
    const endTime = new Date(sale.endDate);
    const hoursRemaining = (endTime.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursRemaining > 0 && hoursRemaining < 24;
  };

  // Helper: Get hours remaining for a sale
  const getHoursRemaining = (sale: Sale): number => {
    if (!sale?.endDate) return 0;
    const now = new Date();
    const endTime = new Date(sale.endDate);
    return Math.max(0, Math.ceil((endTime.getTime() - now.getTime()) / (1000 * 60 * 60)));
  };

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
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-8">
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

      {/* Onboarding Modal — 3-screen intro for new organizers */}
      {showOnboardingModal && dashboardState === 'new' && (
        <OrganizerOnboardingModal onDismiss={() => setShowOnboardingModal(false)} />
      )}

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

      {/* Main Dashboard */}
      {!isSimpleMode && (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Welcome, {user?.name?.split(' ')[0] || user?.name || 'there'}</h1>
            <p className="text-warm-600 dark:text-warm-400">
              {dashboardState === 'new' && "Let's set up your first sale in 5 minutes"}
              {dashboardState === 'active' && 'Your sale is live. Keep the momentum going.'}
              {dashboardState === 'between' && 'Great job! Your sale has ended. Ready for the next one?'}
            </p>
          </div>

          {/* Tier Lapse Banner */}
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

          {/* STATE-AWARE CONTENT */}

          {dashboardState === 'new' && (
            // STATE 1: New Organizer (0 sales ever)
            <div className="space-y-6 mb-8">
              {/* Hero Card */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-8 text-center">
                <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">Welcome to FindA.Sale Organizer</h2>
                <p className="text-warm-600 dark:text-warm-400 mb-6">Let's set up your first sale in 5 minutes</p>

                {/* 3-Step Path */}
                <div className="flex justify-center gap-4 mb-8">
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold mb-2">1</div>
                    <p className="text-xs font-semibold text-warm-700 dark:text-warm-300">Sale Details</p>
                  </div>
                  <div className="w-16 border-t-2 border-amber-300 dark:border-amber-600 flex-1" style={{ marginTop: '20px' }}></div>
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold mb-2">2</div>
                    <p className="text-xs font-semibold text-warm-700 dark:text-warm-300">Add Items</p>
                  </div>
                  <div className="w-16 border-t-2 border-amber-300 dark:border-amber-600 flex-1" style={{ marginTop: '20px' }}></div>
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold mb-2">3</div>
                    <p className="text-xs font-semibold text-warm-700 dark:text-warm-300">Publish</p>
                  </div>
                </div>

                <Link
                  href="/organizer/create-sale"
                  className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-8 rounded-lg transition-colors mb-4"
                >
                  Create Your First Sale
                </Link>
                <p className="text-sm text-warm-600 dark:text-warm-400">
                  <Link href="#" className="text-amber-600 hover:text-amber-700 dark:text-amber-400 underline">Watch a quick tour</Link>
                </p>
              </div>

              {/* Benefits Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                  <p className="text-4xl mb-3">📍</p>
                  <p className="font-semibold text-warm-900 dark:text-warm-100 mb-2">Reach 10,000+ treasure hunters in your area</p>
                  <p className="text-sm text-warm-600 dark:text-warm-400">Connect with local shoppers searching for great deals</p>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                  <p className="text-4xl mb-3">🤖</p>
                  <p className="font-semibold text-warm-900 dark:text-warm-100 mb-2">List items with photos — AI tags them automatically</p>
                  <p className="text-sm text-warm-600 dark:text-warm-400">Snap photos and let AI handle the descriptions</p>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                  <p className="text-4xl mb-3">💰</p>
                  <p className="font-semibold text-warm-900 dark:text-warm-100 mb-2">Track earnings and manage holds in real time</p>
                  <p className="text-sm text-warm-600 dark:text-warm-400">See exactly what's selling and who's interested</p>
                </div>
              </div>

              {/* Quick Link Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Link href="/organizer/create-sale" className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 text-center hover:border-amber-600 dark:hover:border-amber-400 transition-colors">
                  <p className="text-lg mb-2">📋</p>
                  <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm">Create Sale</p>
                </Link>
                <Link href="/sales" className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 text-center hover:border-amber-600 dark:hover:border-amber-400 transition-colors">
                  <p className="text-lg mb-2">🔍</p>
                  <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm">Browse Inspiration</p>
                </Link>
                <Link href="/pricing" className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 text-center hover:border-amber-600 dark:hover:border-amber-400 transition-colors">
                  <p className="text-lg mb-2">💎</p>
                  <p className="font-semibold text-warm-900 dark:text-warm-100 text-sm">See Pricing</p>
                </Link>
              </div>
            </div>
          )}

          {dashboardState === 'active' && activeSale && (
            // STATE 2: Active Organizer (DRAFT or PUBLISHED sale)
            <div className="space-y-6 mb-8">
              {/* Sale Status Widget (HIGHEST PRIORITY) */}
              <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6 overflow-hidden">
                <div className="flex flex-col md:flex-row gap-6">
                  {/* Photo Thumbnail */}
                  {activeSale.photoUrls && activeSale.photoUrls[0] && (
                    <div className="md:w-32 flex-shrink-0">
                      <img src={activeSale.photoUrls[0]} alt={activeSale.title} className="w-full h-32 object-cover rounded-lg" />
                    </div>
                  )}

                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">{activeSale.title}</h2>
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                          activeSale.status === 'PUBLISHED'
                            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                            : 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
                        }`}>
                          {activeSale.status === 'PUBLISHED' ? '🟢 LIVE' : '⚠️ DRAFT'}
                          {isEndingSoon(activeSale) && ' • ENDING SOON'}
                        </span>
                      </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-3 gap-4 mb-6 py-4 border-y border-warm-200 dark:border-gray-700">
                      <div>
                        <p className="text-sm text-warm-600 dark:text-warm-400 mb-1">Items Listed</p>
                        <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">—</p>
                      </div>
                      <div>
                        <p className="text-sm text-warm-600 dark:text-warm-400 mb-1">Visitors Today</p>
                        <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">—</p>
                      </div>
                      <div>
                        <p className="text-sm text-warm-600 dark:text-warm-400 mb-1">Active Holds</p>
                        <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{holdCountData?.count ?? 0}</p>
                      </div>
                    </div>

                    {/* Status-Specific CTAs */}
                    <div className="flex flex-wrap gap-2">
                      {activeSale.status === 'DRAFT' && (
                        <>
                          <button className="bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm">
                            Finish Setup
                          </button>
                          <Link href={`/organizer/edit-sale/${activeSale.id}`} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm">
                            Publish Sale
                          </Link>
                        </>
                      )}
                      {activeSale.status === 'PUBLISHED' && (
                        <>
                          <Link href={`/organizer/add-items/${activeSale.id}`} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm">
                            Manage Items
                          </Link>
                          <Link href={`/sales/${activeSale.id}`} className="bg-warm-200 dark:bg-gray-700 hover:bg-warm-300 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 font-semibold py-2 px-4 rounded-lg transition-colors text-sm">
                            View Live Sale
                          </Link>
                        </>
                      )}
                      {isEndingSoon(activeSale) && (
                        <>
                          <button className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm">
                            Extend Sale
                          </button>
                          <button className="bg-warm-200 dark:bg-gray-700 text-warm-900 dark:text-warm-100 font-semibold py-2 px-4 rounded-lg transition-colors text-sm">
                            Mark Ended
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Next Action Zone */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <p className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
                  {activeSale.status === 'DRAFT' && '📋 Add items to your inventory'}
                  {activeSale.status === 'PUBLISHED' && holdCountData && holdCountData.count > 0 && `💳 You have ${holdCountData.count} pending holds`}
                  {activeSale.status === 'PUBLISHED' && (!holdCountData || holdCountData.count === 0) && '📦 Manage your items'}
                  {isEndingSoon(activeSale) && `⏰ Your sale ends in ${getHoursRemaining(activeSale)} hours`}
                </p>
                <Link href={activeSale.status === 'DRAFT' ? `/organizer/add-items/${activeSale.id}` : '/organizer/holds'} className="text-blue-600 dark:text-blue-400 hover:underline font-semibold text-sm">
                  Take action →
                </Link>
              </div>

              {/* Quick Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                  <p className="text-sm text-warm-600 dark:text-warm-400 mb-2">Current Sale Revenue</p>
                  <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">${(statsData?.revenue.currentSale ?? 0).toFixed(2)}</p>
                  <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">{statsData?.activeSale?.title || 'No active sale'}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                  <p className="text-sm text-warm-600 dark:text-warm-400 mb-2">Items Listed</p>
                  <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{statsData?.items.total ?? 0}</p>
                  <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">{statsData?.items.sold ?? 0} sold</p>
                </div>
                <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                  <p className="text-sm text-warm-600 dark:text-warm-400 mb-2">Active Holds</p>
                  <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{statsData?.activeSale?.holdCount ?? 0}</p>
                  {(statsData?.activeSale?.holdCount ?? 0) > 0 && (
                    <Link href="/organizer/holds" className="text-amber-600 hover:text-amber-700 dark:text-amber-400 text-xs font-semibold mt-2 inline-block">
                      View holds →
                    </Link>
                  )}
                </div>
              </div>

              {/* Tier Progress Card */}
              {tierData && (
                <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100">Tier Progress</h3>
                    <OrganizerTierBadge tier={tierData.tier} />
                  </div>
                  <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">{tierData.benefits.label}</p>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                    <div className="bg-amber-600 h-2 rounded-full" style={{ width: `${Math.min((tierData.progress.completedSales / tierData.progress.salesNeeded) * 100, 100)}%` }}></div>
                  </div>
                  <p className="text-xs text-warm-600 dark:text-warm-400 mb-4">{tierData.progress.completedSales}/{tierData.progress.salesNeeded} sales until next tier</p>
                  <Link href="/organizer/pricing" className="text-amber-600 hover:text-amber-700 dark:text-amber-400 font-semibold text-sm">
                    See all tiers →
                  </Link>
                </div>
              )}

              {/* Selling Tools Grid (6 tools, tier-gated) */}
              <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Selling Tools</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Link href="/organizer/create-sale" className="flex flex-col items-center gap-2 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg hover:bg-warm-100 dark:hover:bg-gray-600 transition-colors text-center">
                    <span className="text-2xl">📋</span>
                    <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">Create Sale</p>
                  </Link>
                  <Link href={`/organizer/add-items/${activeSale.id}`} className="flex flex-col items-center gap-2 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg hover:bg-warm-100 dark:hover:bg-gray-600 transition-colors text-center">
                    <span className="text-2xl">📷</span>
                    <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">Add Items</p>
                  </Link>
                  <Link href="/organizer/qr" className="flex flex-col items-center gap-2 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg hover:bg-warm-100 dark:hover:bg-gray-600 transition-colors text-center">
                    <span className="text-2xl">📱</span>
                    <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">QR Codes</p>
                  </Link>
                  <Link href="/organizer/pos" className="flex flex-col items-center gap-2 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg hover:bg-warm-100 dark:hover:bg-gray-600 transition-colors text-center">
                    <span className="text-2xl">💳</span>
                    <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">POS Checkout</p>
                  </Link>
                  <button onClick={() => canAccess('PRO') ? router.push('/organizer/print-inventory') : router.push('/pricing')} className="flex flex-col items-center gap-2 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg hover:bg-warm-100 dark:hover:bg-gray-600 transition-colors text-center">
                    <span className="text-2xl">{canAccess('PRO') ? '🖨️' : '🔒'}</span>
                    <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">Print Inventory {!canAccess('PRO') && '(PRO)'}</p>
                  </button>
                  <Link href="/organizer/insights" className="flex flex-col items-center gap-2 p-4 bg-warm-50 dark:bg-gray-700 rounded-lg hover:bg-warm-100 dark:hover:bg-gray-600 transition-colors text-center">
                    <span className="text-2xl">📊</span>
                    <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">Analytics</p>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {dashboardState === 'between' && (
            // STATE 3: Between Sales (all ENDED)
            <div className="space-y-6 mb-8">
              {/* Congratulations Card */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-lg p-8 text-center">
                <h2 className="text-2xl font-bold text-green-900 dark:text-green-100 mb-2">Great job! Your sale has ended.</h2>
                <p className="text-green-700 dark:text-green-300 mb-6">Check out your earnings and see what sold.</p>
                <Link href="/organizer/create-sale" className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg transition-colors">
                  Create Another Sale
                </Link>
              </div>

              {/* Past Sales Archive */}
              <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Past Sales</h3>
                <div className="space-y-4">
                  {salesData.map((sale: Sale) => (
                    <div key={sale.id} className="flex items-center justify-between p-4 bg-warm-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex-1">
                        <p className="font-semibold text-warm-900 dark:text-warm-100">{sale.title}</p>
                        <p className="text-sm text-warm-600 dark:text-warm-400">{sale.city}, {sale.state}</p>
                      </div>
                      <Link href={`/sales/${sale.id}`} className="text-amber-600 hover:text-amber-700 dark:text-amber-400 font-semibold text-sm ml-4">
                        View Details →
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions (always visible) */}
          <div className="flex flex-wrap gap-3 mb-4">
            <Link href="/organizer/create-sale" className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
              + Create New Sale
            </Link>
            {salesData && salesData.length > 0 && (
              <>
                <Link href={salesData.length === 1 ? `/organizer/add-items/${salesData[0].id}` : '/organizer/sales'} className="bg-warm-200 dark:bg-gray-700 hover:bg-warm-300 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 font-bold py-2 px-6 rounded-lg transition-colors">
                  📦 Add Items
                </Link>
                <Link href="/organizer/holds" className="relative bg-amber-100 hover:bg-amber-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-amber-900 dark:text-amber-100 font-bold py-2 px-6 rounded-lg transition-colors">
                  🤝 Holds {(holdCountData?.count ?? 0) > 0 && `(${holdCountData!.count})`}
                </Link>
                <Link href="/organizer/pos" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                  💳 POS
                </Link>
              </>
            )}
          </div>

        </div>
      </div>
      )}
    </>
  );
};

export default OrganizerDashboard;
