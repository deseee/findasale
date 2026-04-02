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
import Tooltip from '../../components/Tooltip';
import SaleQRCode from '../../components/SaleQRCode';
import FlashDealForm from '../../components/FlashDealForm';
import SocialPostGenerator from '../../components/SocialPostGenerator';
import OnboardingWizard from '../../components/OnboardingWizard';
import OrganizerOnboardingModal from '../../components/OrganizerOnboardingModal';
import SimpleModePanel from '../../components/SimpleModePanel';
import SaleStatusWidget from '../../components/SaleStatusWidget';
import SecondarySaleCard from '../../components/SecondarySaleCard';
import Head from 'next/head';
import Link from 'next/link';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import { AnimatedCounter } from '../../components/AnimatedCounter';
import SalePulseWidget from '../../components/SalePulseWidget';
import SmartBuyerWidget from '../../components/SmartBuyerWidget';
import HighValueTrackerWidget from '../../components/HighValueTrackerWidget';
import EfficiencyCoachingWidget from '../../components/EfficiencyCoachingWidget';
import WeatherStrip from '../../components/WeatherStrip';
import PostSaleMomentumCard from '../../components/PostSaleMomentumCard';
import { isWidgetVisible, getSaleTypeConfig } from '../../lib/dashboard-sale-type-config';

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
  saleType?: string;
  startDate: string;
  endDate: string;
  photoUrls: string[];
  city: string;
  state: string;
  description?: string;
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
  const [manualPrimaryId, setManualPrimaryId] = useState<string | null>(null);
  const [dismissedMultiSaleBanner, setDismissedMultiSaleBanner] = useState(false);
  const [addItemsDropdownOpen, setAddItemsDropdownOpen] = useState(false);
  const [posDropdownOpen, setPosDropdownOpen] = useState(false);
  const [otherSalesExpanded, setOtherSalesExpanded] = useState(false);

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
          status: string;
          endDate: string;
          viewCount: number;
          holdCount: number;
          saleType: string;
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
    // If manually overridden, return that sale
    if (manualPrimaryId) {
      const manual = salesData.find((s: Sale) => s.id === manualPrimaryId);
      if (manual && (manual.status === 'DRAFT' || manual.status === 'PUBLISHED')) {
        return manual;
      }
    }
    // Otherwise: prefer most recent PUBLISHED, then most recent DRAFT
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

  // Helper: Get urgency tag based on hours remaining from statsData activeSale
  const getUrgencyTag = () => {
    if (!statsData?.activeSale?.endDate || statsData.activeSale.status !== 'PUBLISHED') return null;
    const now = new Date();
    const endTime = new Date(statsData.activeSale.endDate);
    const hoursRemaining = (endTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursRemaining <= 0) return null; // Sale already ended
    if (hoursRemaining < 6) {
      return { text: `ENDING IN ${Math.ceil(hoursRemaining)}h`, color: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200' };
    }
    if (hoursRemaining < 24) {
      return { text: `ENDING IN ${Math.ceil(hoursRemaining)}h`, color: 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200' };
    }
    return null;
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
              {dashboardState === 'active' && activeSale && getSaleTypeConfig(activeSale.saleType).greeting}
              {dashboardState === 'between' && 'Great job! Your sale has ended. Ready for the next one?'}
            </p>
          </div>

          {/* Consolidated Action Bar — always visible */}
          <div className="flex flex-wrap gap-2 mb-8 relative">
            <Link href="/organizer/create-sale" className="rounded-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors">
              + New Sale
            </Link>

            {/* Add Items with dropdown for multi-sale */}
            {(() => {
              const activeOrDraftSales = salesData?.filter((s: Sale) => ['DRAFT', 'PUBLISHED', 'SCHEDULED'].includes(s.status)) ?? [];
              if (activeOrDraftSales.length <= 1) {
                return (
                  <Link href={activeSale ? `/organizer/add-items/${activeSale.id}` : '/organizer/sales'} className="rounded-full px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 transition-colors">
                    Add Items
                  </Link>
                );
              }
              return (
                <div className="relative">
                  <button
                    onClick={() => setAddItemsDropdownOpen(!addItemsDropdownOpen)}
                    className="rounded-full px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 transition-colors"
                  >
                    Add Items
                  </button>
                  {addItemsDropdownOpen && (
                    <div className="absolute top-full mt-2 left-0 z-50 bg-gray-800 dark:bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-0 w-max min-w-48">
                      {activeOrDraftSales.map((sale: Sale) => (
                        <Link
                          key={sale.id}
                          href={`/organizer/add-items/${sale.id}`}
                          className="block w-full px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-800 transition-colors first:rounded-t-lg last:rounded-b-lg border-b border-gray-700 last:border-b-0"
                          onClick={() => setAddItemsDropdownOpen(false)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{sale.title}</span>
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                              sale.status === 'PUBLISHED'
                                ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                                : 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
                            }`}>
                              {sale.status === 'PUBLISHED' ? 'LIVE' : sale.status}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <Link href="/organizer/holds" className="rounded-full px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors">
              Holds
            </Link>

            {/* POS with dropdown for multi-sale */}
            {(() => {
              const activeOrDraftSales = salesData?.filter((s: Sale) => ['DRAFT', 'PUBLISHED', 'SCHEDULED'].includes(s.status)) ?? [];
              if (activeOrDraftSales.length <= 1) {
                return (
                  <Link href={activeSale ? `/organizer/pos?saleId=${activeSale.id}` : '/organizer/sales'} className="rounded-full px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors">
                    POS
                  </Link>
                );
              }
              return (
                <div className="relative">
                  <button
                    onClick={() => setPosDropdownOpen(!posDropdownOpen)}
                    className="rounded-full px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
                  >
                    POS
                  </button>
                  {posDropdownOpen && (
                    <div className="absolute top-full mt-2 left-0 z-50 bg-gray-800 dark:bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-0 w-max min-w-48">
                      {activeOrDraftSales.map((sale: Sale) => (
                        <Link
                          key={sale.id}
                          href={`/organizer/pos?saleId=${sale.id}`}
                          className="block w-full px-4 py-2 text-sm text-white hover:bg-gray-700 dark:hover:bg-gray-800 transition-colors first:rounded-t-lg last:rounded-b-lg border-b border-gray-700 last:border-b-0"
                          onClick={() => setPosDropdownOpen(false)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{sale.title}</span>
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                              sale.status === 'PUBLISHED'
                                ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                                : 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
                            }`}>
                              {sale.status === 'PUBLISHED' ? 'LIVE' : sale.status}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <Link href="/organizer/ripples" className="rounded-full px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 transition-colors">
              Ripples
            </Link>
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
              {/* Sale Status Widget (HIGHEST PRIORITY) — Enhanced with urgency + dynamic CTA */}
              {statsData?.activeSale && (
                <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6 overflow-hidden">
                  <Link href={`/organizer/edit-sale/${statsData.activeSale.id}`} className="block">
                    <div className="flex flex-col md:flex-row gap-6 cursor-pointer hover:opacity-80 transition-opacity">
                      {/* Photo Thumbnail */}
                      {activeSale.photoUrls && activeSale.photoUrls[0] && (
                        <div className="md:w-32 flex-shrink-0">
                          <img src={activeSale.photoUrls[0]} alt={activeSale.title} className="w-full h-32 object-cover rounded-lg" />
                        </div>
                      )}

                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex-1">
                            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100 mb-2">{statsData.activeSale.title}</h2>
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                                statsData.activeSale.status === 'PUBLISHED'
                                  ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                                  : 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
                              }`}>
                                {statsData.activeSale.status === 'PUBLISHED' ? '🟢 LIVE' : '⚠️ DRAFT'}
                              </span>
                              {(() => { const urgency = getUrgencyTag(); return urgency ? (
                                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${urgency.color}`}>
                                  {urgency.text}
                                </span>
                              ) : null; })()}
                              {/* Weather Strip inline with status badge */}
                              <div className="flex-shrink-0">
                                <WeatherStrip saleStartDate={activeSale.startDate} saleCity={activeSale.city} status={statsData?.activeSale?.status === 'PUBLISHED' ? 'LIVE' : undefined} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>

                  {/* Context-Aware Primary CTA */}
                  <div className="flex flex-wrap gap-2 mt-4">
                    {statsData.activeSale.status === 'DRAFT' && statsData.items.draft > 0 && (
                      <Link href={`/organizer/add-items/${statsData.activeSale.id}`} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm">
                        Add Photos
                      </Link>
                    )}
                    {statsData.activeSale.status === 'DRAFT' && statsData.items.draft === 0 && (
                      <Link href={`/organizer/edit-sale/${statsData.activeSale.id}`} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm">
                        Publish Sale
                      </Link>
                    )}
                  </div>

                  {/* Consolidated Action Buttons Row */}
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-warm-200 dark:border-gray-700">
                    <Link href={`/sales/${statsData.activeSale.id}`} className="text-sm px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors" title="See your sale as shoppers see it">
                      View Live
                    </Link>
                    {statsData.activeSale.status === 'PUBLISHED' && (
                      <Link href={`/organizer/add-items/${statsData.activeSale.id}`} className="text-sm px-3 py-1 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors" title="Add, edit, or remove items from this sale">
                        Items
                      </Link>
                    )}
                    <Link href={`/organizer/holds?saleId=${statsData.activeSale.id}`} className="text-sm px-3 py-1 bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 rounded-full hover:bg-orange-200 dark:hover:bg-orange-800 transition-colors" title="View and manage shopper holds for this sale">
                      Holds
                    </Link>
                    <Link href={`/organizer/pos?saleId=${statsData.activeSale.id}`} className="text-sm px-3 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full hover:bg-green-200 dark:hover:bg-green-800 transition-colors" title="Open Point of Sale to process in-person transactions">
                      POS
                    </Link>
                    {statsData.activeSale.status === 'PUBLISHED' && (
                      <button
                        onClick={async () => {
                          const confirmed = window.confirm('Close this sale early? You can reopen it later from your dashboard.');
                          if (!confirmed) return;
                          try {
                            await api.patch(`/sales/${statsData.activeSale!.id}/status`, { status: 'ENDED' });
                            showToast('Sale closed successfully', 'success');
                            setTimeout(() => window.location.reload(), 1000);
                          } catch (error: any) {
                            console.error('Failed to close sale:', error);
                            showToast(error.response?.data?.message || 'Failed to close sale', 'error');
                          }
                        }}
                        className="text-sm px-3 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-full hover:bg-red-200 dark:hover:bg-red-800 transition-colors"
                        title="End your sale before the scheduled end date"
                      >
                        Close Sale
                      </button>
                    )}
                  </div>

                  {/* Compact Holds Summary */}
                  <div className="mt-4 pt-4 border-t border-warm-200 dark:border-gray-700">
                    {statsData.activeSale.holdCount === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No active holds</p>
                    ) : (
                      <div className="text-sm">
                        <p className="font-medium text-warm-900 dark:text-warm-100 mb-2">
                          {statsData.activeSale.holdCount} active hold{statsData.activeSale.holdCount !== 1 ? 's' : ''}
                        </p>
                        <Link href={`/organizer/holds?saleId=${statsData.activeSale.id}`} className="text-amber-600 dark:text-amber-400 font-semibold hover:underline">
                          Manage holds →
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Earnings/Payout Alert — conditional banner */}
              {cashFeeBalance > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-green-900 dark:text-green-100">You have ${cashFeeBalance.toFixed(2)} ready to withdraw</p>
                    <p className="text-sm text-green-700 dark:text-green-300">Platform fee credits available for payout.</p>
                  </div>
                  <Link href="/organizer/earnings" className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm flex-shrink-0">
                    Withdraw Now
                  </Link>
                </div>
              )}

              {/* Next Action Zone — 6-condition logic tree */}
              {statsData?.activeSale && (() => {
                const { status, id, holdCount } = statsData.activeSale;
                const { draft, available } = statsData.items;
                const hoursUntilEnd = getHoursRemaining(activeSale);

                // Condition 1: DRAFT + items.draft > 0 + no holds
                if (status === 'DRAFT' && draft > 0 && holdCount === 0) {
                  return (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">Ready to go live? Publish your sale.</p>
                          <p className="text-sm text-amber-700 dark:text-amber-300">You have {draft} items ready.</p>
                        </div>
                        <Link href={`/organizer/edit-sale/${id}`} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm flex-shrink-0 ml-4">
                          Publish Sale
                        </Link>
                      </div>
                    </div>
                  );
                }

                // Condition 2: holdCount > 5 && items.available < 5
                if (holdCount > 5 && available < 5) {
                  return (
                    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-orange-900 dark:text-orange-100 mb-1">You have {holdCount} holds! Add more items.</p>
                          <p className="text-sm text-orange-700 dark:text-orange-300">Only {available} items left available.</p>
                        </div>
                        <Link href={`/organizer/add-items/${id}`} className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm flex-shrink-0 ml-4">
                          Add Items
                        </Link>
                      </div>
                    </div>
                  );
                }

                // Condition 3: endDate && hoursUntilEnd < 6 && status === PUBLISHED && holdCount > 0
                if (status === 'PUBLISHED' && hoursUntilEnd < 6 && hoursUntilEnd >= 0 && holdCount > 0) {
                  return (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-red-900 dark:text-red-100 mb-1">Sale ends in {hoursUntilEnd}h with {holdCount} active holds.</p>
                          <p className="text-sm text-red-700 dark:text-red-300">Prepare to close and fulfill orders.</p>
                        </div>
                        <Link href="/organizer/holds" className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm flex-shrink-0 ml-4">
                          Review Holds
                        </Link>
                      </div>
                    </div>
                  );
                }

                // Condition 4: items.draft > 0
                if (draft > 0) {
                  return (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">You have {draft} items in draft.</p>
                          <p className="text-sm text-amber-700 dark:text-amber-300">Finish adding photos or publish when ready.</p>
                        </div>
                        <Link href={`/organizer/add-items/${id}`} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm flex-shrink-0 ml-4">
                          Review Drafts
                        </Link>
                      </div>
                    </div>
                  );
                }

                // Condition 5: viewCount > 10 && holdCount === 0
                if (statsData.activeSale.viewCount > 10 && holdCount === 0) {
                  return (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">Visitors are checking out but no holds yet.</p>
                          <p className="text-sm text-blue-700 dark:text-blue-300">Keep adding items to attract more buyers.</p>
                        </div>
                        <Link href={`/organizer/add-items/${id}`} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm flex-shrink-0 ml-4">
                          Add Items
                        </Link>
                      </div>
                    </div>
                  );
                }

                // Condition 6: Default (healthy) — smart contextual nudge
                // Check item count first (use draft count if available)
                const itemCount = available || (statsData.items.total - statsData.items.draft) || 0;

                if (itemCount === 0 || (status === 'DRAFT' && statsData.items.draft === 0)) {
                  return (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm text-amber-800 dark:text-amber-200">
                      Add your first items to go live
                    </div>
                  );
                }

                if (statsData.activeSale.viewCount > 10) {
                  return (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-sm text-blue-800 dark:text-blue-200">
                      X shoppers have questions — answer them
                    </div>
                  );
                }

                if (!activeSale?.description) {
                  return (
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm text-amber-800 dark:text-amber-200">
                      Add a sale description to attract more shoppers
                    </div>
                  );
                }

                return (
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-sm text-green-800 dark:text-green-200">
                    Your sale is live — keep it up!
                  </div>
                );
              })()}

              {/* Other Active Sales — Collapsible Section (positioned before Real-Time Metrics) */}
              {(() => {
                const otherActiveSales = salesData?.filter(
                  (s: Sale) =>
                    s.id !== activeSale?.id &&
                    ['DRAFT', 'PUBLISHED', 'SCHEDULED'].includes(s.status)
                ) ?? [];

                const sortedOtherSales = otherActiveSales.sort(
                  (a: Sale, b: Sale) =>
                    new Date(b.startDate ?? 0).getTime() -
                    new Date(a.startDate ?? 0).getTime()
                );

                // Only show if there are other active sales
                if (sortedOtherSales.length === 0) return null;

                // Set default expanded state: true if exactly 1, false if 2+
                const shouldDefaultExpand = sortedOtherSales.length === 1;
                if (!otherSalesExpanded && shouldDefaultExpand) {
                  // Auto-expand on first render if exactly 1 sale
                  setOtherSalesExpanded(true);
                }

                return (
                  <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg">
                    {/* Collapsible Header */}
                    <div className="flex justify-between items-center p-4 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors">
                      <button
                        onClick={() => setOtherSalesExpanded(!otherSalesExpanded)}
                        className="flex-1 flex justify-between items-center text-left"
                      >
                        <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100">
                          Other Active Sales ({sortedOtherSales.length})
                        </h3>
                        <span className={`transition-transform ${otherSalesExpanded ? 'rotate-180' : ''}`}>
                          ▼
                        </span>
                      </button>
                      <Link href="/organizer/command-center" className="text-xs text-blue-500 hover:text-blue-400 underline ml-2 whitespace-nowrap">
                        → Command Center
                      </Link>
                    </div>

                    {/* Expanded Content */}
                    {otherSalesExpanded && (
                      <div className="border-t border-warm-200 dark:border-gray-700 p-4 space-y-3">
                        {sortedOtherSales.slice(0, 2).map((sale: any) => (
                          <SecondarySaleCard
                            key={sale.id}
                            sale={sale}
                            stats={sale.stats || {
                              itemCount: 0,
                              holdCount: 0,
                              visitorCount: 0,
                            }}
                            onMakePrimary={(saleId) => {
                              setManualPrimaryId(saleId);
                            }}
                          />
                        ))}

                        {/* "More sales" link */}
                        {sortedOtherSales.length > 2 && (
                          <p className="text-sm text-warm-600 dark:text-warm-400 pt-2">
                            +{sortedOtherSales.length - 2} more sale
                            {sortedOtherSales.length - 2 !== 1 ? 's' : ''} in{' '}
                            <Link
                              href="/organizer/command-center"
                              className="text-amber-600 dark:text-amber-400 font-semibold hover:underline"
                            >
                              Command Center →
                            </Link>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Real-Time Metrics Panel */}
              {statsData?.activeSale && (
                <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Real-Time Metrics</h3>
                  {statsData.activeSale.status === 'PUBLISHED' ? (
                    // Live sale: 4-col metrics
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Link href={`/organizer/add-items/${statsData.activeSale.id}`} className="text-center p-3 rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors cursor-pointer">
                        <div className="flex items-center justify-center gap-1 mb-2">
                          <p className="text-sm text-warm-600 dark:text-warm-400">Items Listed</p>
                          <Tooltip content="Total items you've added to this sale" position="top" />
                        </div>
                        <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{statsData.items.total ?? '--'}</p>
                      </Link>
                      <Link href="/organizer/ripples" className="text-center p-3 rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors cursor-pointer">
                        <div className="flex items-center justify-center gap-1 mb-2">
                          <p className="text-sm text-warm-600 dark:text-warm-400">Visitors Today</p>
                          <Tooltip content="Unique shoppers who viewed your sale today" position="top" />
                        </div>
                        <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{statsData.activeSale.viewCount ?? '--'}</p>
                      </Link>
                      <Link href="/organizer/holds" className="text-center p-3 rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors cursor-pointer">
                        <div className="flex items-center justify-center gap-1 mb-2">
                          <p className="text-sm text-warm-600 dark:text-warm-400">Active Holds</p>
                          <Tooltip content="Items shoppers are currently holding — these are reserved temporarily" position="top" />
                        </div>
                        <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{statsData.activeSale.holdCount ?? '--'}</p>
                      </Link>
                      <Link href="/organizer/pos" className="text-center p-3 rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors cursor-pointer">
                        <div className="flex items-center justify-center gap-1 mb-2">
                          <p className="text-sm text-warm-600 dark:text-warm-400">Items Sold</p>
                          <Tooltip content="Items marked as sold in this sale" position="top" />
                        </div>
                        <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{statsData.items.sold ?? '--'}</p>
                      </Link>
                    </div>
                  ) : (
                    // Draft sale: 3-col metrics
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center">
                        <p className="text-sm text-warm-600 dark:text-warm-400 mb-2">Items Drafted</p>
                        <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{statsData.items.draft ?? '--'}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-warm-600 dark:text-warm-400 mb-2">Items with Photos</p>
                        <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{statsData.items.total != null && statsData.items.draft != null ? statsData.items.total - statsData.items.draft : '--'}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm text-warm-600 dark:text-warm-400 mb-2">Ready to Publish</p>
                        <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{statsData.items.available != null ? Math.max(0, statsData.items.available) : '--'}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tier Badge + Link (compact) */}
              {tierData && (
                <div className="flex items-center justify-between p-4 bg-warm-50 dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div>
                      <OrganizerTierBadge tier={tierData.tier} showLevelUpCopy={true} completedSales={tierData.progress.completedSales} />
                      <p className="text-xs text-warm-600 dark:text-warm-400 mt-2">{tierData.progress.completedSales}/{tierData.progress.salesNeeded} sales until next tier</p>
                    </div>
                  </div>
                  {user?.organizerTier !== 'TEAMS' && (
                    <Link href="/pricing" className="text-amber-600 hover:text-amber-700 dark:text-amber-400 font-semibold text-sm">
                      Upgrade →
                    </Link>
                  )}
                </div>
              )}


              {/* Past Sales List */}
              {salesData && salesData.filter((s: Sale) => s.status === 'ENDED').length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100">Past Sales</h3>
                    <Link href="/organizer/sales" className="text-amber-600 hover:text-amber-700 dark:text-amber-400 text-sm font-semibold">
                      View all →
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {salesData.filter((s: Sale) => s.status === 'ENDED').slice(0, 5).map((sale: Sale) => (
                      <div key={sale.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors">
                        <div className="flex-1">
                          <p className="font-medium text-warm-900 dark:text-warm-100 text-sm">{sale.title}</p>
                          <p className="text-xs text-warm-600 dark:text-warm-400">{sale.city}, {sale.state}</p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!window.confirm('Reopen this sale? It will become visible to shoppers again.')) return;
                            try {
                              await api.patch(`/sales/${sale.id}/status`, { status: 'PUBLISHED' });
                              showToast('Sale reopened', 'success');
                              setTimeout(() => window.location.reload(), 1000);
                            } catch (error: any) {
                              showToast(error.response?.data?.message || 'Failed to reopen', 'error');
                            }
                          }}
                          className="text-amber-600 hover:text-amber-700 dark:text-amber-400 font-semibold text-xs px-3 py-1 border border-amber-300 dark:border-amber-600 rounded-full hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors ml-4"
                        >
                          Reopen
                        </button>
                        {sale.status === 'ENDED' && (
                          <Link href={`/organizer/settlement/${sale.id}`} className="text-green-600 hover:text-green-700 dark:text-green-400 font-semibold text-xs ml-2">
                            Settle →
                          </Link>
                        )}
                        <Link href={`/sales/${sale.id}`} className="text-amber-600 hover:text-amber-700 dark:text-amber-400 font-semibold text-xs ml-2">
                          View Details →
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feature #228: Dashboard Widgets — State 2 (active sale) */}
              {activeSale && (
                <>
                  {/* Widget Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isWidgetVisible(statsData?.activeSale?.saleType, 'SalePulse') && (
                      <SalePulseWidget saleId={activeSale.id} />
                    )}
                    {isWidgetVisible(statsData?.activeSale?.saleType, 'SmartBuyer') && (
                      <SmartBuyerWidget saleId={activeSale.id} />
                    )}
                    {isWidgetVisible(statsData?.activeSale?.saleType, 'HighValueTracker') && (
                      <HighValueTrackerWidget saleId={activeSale.id} />
                    )}
                    {isWidgetVisible(statsData?.activeSale?.saleType, 'EfficiencyCoaching') && (
                      <EfficiencyCoachingWidget />
                    )}
                  </div>
                </>
              )}

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

              {/* Feature #228: Post-Sale Momentum + Efficiency Coaching — State 3 */}
              {salesData && salesData.length > 0 && (() => {
                const mostRecentEnded = salesData
                  .filter((s: Sale) => s.status === 'ENDED')
                  .sort((a: Sale, b: Sale) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())[0];
                if (!mostRecentEnded) return null;
                const revenue = statsData?.revenue?.totalLifetime ?? 0;
                const soldItems = statsData?.items?.sold ?? 0;
                const totalItems = statsData?.items?.total ?? 0;
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <PostSaleMomentumCard
                      saleId={mostRecentEnded.id}
                      saleTitle={mostRecentEnded.title}
                      totalRevenue={revenue}
                      itemsSold={soldItems}
                      totalItems={totalItems}
                    />
                    <EfficiencyCoachingWidget />
                  </div>
                );
              })()}

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
                      <div className="flex items-center gap-2 ml-4">
                        {sale.status === 'ENDED' && (
                          <>
                            <button
                              onClick={async () => {
                                const confirmed = window.confirm('Reopen this sale? It will become visible to shoppers again.');
                                if (!confirmed) return;
                                try {
                                  await api.patch(`/sales/${sale.id}/status`, { status: 'PUBLISHED' });
                                  showToast('Sale reopened', 'success');
                                  setTimeout(() => window.location.reload(), 1000);
                                } catch (error: any) {
                                  console.error('Failed to reopen sale:', error);
                                  showToast(error.response?.data?.message || 'Failed to reopen sale', 'error');
                                }
                              }}
                              className="text-amber-600 hover:text-amber-700 dark:text-amber-400 font-semibold text-sm px-3 py-1 border border-amber-300 dark:border-amber-600 rounded-full hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                            >
                              Reopen
                            </button>
                            <Link href={`/organizer/settlement/${sale.id}`} className="text-green-600 hover:text-green-700 dark:text-green-400 font-semibold text-sm">
                              Settle →
                            </Link>
                          </>
                        )}
                        <Link href={`/sales/${sale.id}`} className="text-amber-600 hover:text-amber-700 dark:text-amber-400 font-semibold text-sm">
                          View Details →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
      )}
    </>
  );
};

export default OrganizerDashboard;
