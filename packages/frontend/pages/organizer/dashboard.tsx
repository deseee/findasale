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

const OrganizerDashboard = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const { isSimple, canAccess } = useOrganizerTier();
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

  // Redirect if not authenticated or not an organizer
  if (!isLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  // Fetch organizer's sales
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['organizer-sales', user?.id],
    queryFn: async () => {
      const response = await api.get('/sales/mine');
      return response.data.sales;
    },
    enabled: !!user?.id,
  });

  // Fetch organizer analytics (total items, revenue)
  const { data: analyticsData } = useQuery({
    queryKey: ['organizer-analytics', user?.id],
    queryFn: async () => {
      const response = await api.get('/organizers/me/analytics');
      return response.data;
    },
    enabled: !!user?.id,
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
      };
    },
    enabled: !!user?.id,
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
    enabled: !!user?.id,
    staleTime: 2 * 60_000,
  });

  // #24: Fetch active hold count for dashboard badge
  const { data: holdCountData } = useQuery({
    queryKey: ['organizer-hold-count', user?.id],
    queryFn: async () => {
      const response = await api.get('/reservations/organizer/count');
      return response.data as { count: number };
    },
    enabled: !!user?.id,
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
    enabled: !!user?.id,
  });

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
          <Skeleton className="h-6 w-96 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
            <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Welcome, {user?.businessName || user?.firstName}</h1>
            <p className="text-warm-600 dark:text-warm-400">Manage your estate sales and track earnings.</p>
          </div>

          {/* Action Buttons - Grouped Sections */}
          <div className="space-y-4 mb-8">
            {/* Section 1: Quick Actions (always visible) */}
            <div>
              <h3 className="text-xs font-semibold text-warm-500 dark:text-warm-400 uppercase tracking-wide mb-2">Quick Actions</h3>
              <div className="flex flex-wrap gap-4">
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
              </div>
            </div>

            {/* Section 2: Essential Tools (collapsible on mobile, visible on desktop) */}
            <details open={!isMobileView} className="group">
              <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 text-sm font-semibold uppercase text-warm-600 dark:text-warm-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded transition-colors md:pointer-events-none md:cursor-default">
                <span className="group-open:hidden md:hidden">▶</span>
                <span className="hidden group-open:inline">▼</span>
                Essential Tools
              </summary>
              <div className="flex flex-wrap gap-4 md:mt-0">
                <Link
                  href="/organizer/print-inventory"
                  className="bg-purple-100 hover:bg-purple-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-purple-900 dark:text-purple-100 font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  🖨️ Print Inventory
                </Link>
                <Link
                  href="/organizer/pos"
                  className="bg-emerald-100 hover:bg-emerald-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-emerald-900 dark:text-emerald-100 font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  💳 POS
                </Link>
                <Link
                  href="/organizer/message-templates"
                  className="bg-green-100 hover:bg-green-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-green-900 dark:text-green-100 font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  📝 Message Templates
                </Link>
              </div>
            </details>

            {/* Section 3: Pro Features (collapsible) */}
            <details open={!isMobileView && (canAccess('PRO') || canAccess('TEAMS'))} className="group">
              <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 text-sm font-semibold uppercase text-warm-600 dark:text-warm-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded transition-colors">
                <span className="group-open:hidden">▶</span>
                <span className="hidden group-open:inline">▼</span>
                Pro Features
              </summary>
              <div className="mt-3 ml-3 flex flex-wrap gap-4">
                {canAccess('PRO') && (
                  <>
                    <TierGatedButton
                      href="/organizer/insights"
                      label="Insights"
                      icon="📊"
                      requiredTier="PRO"
                      className="bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100"
                    />
                    <TierGatedButton
                      href="/organizer/command-center"
                      label="Command Center"
                      icon="⚙️"
                      requiredTier="PRO"
                      className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/30 text-slate-900 dark:text-slate-100"
                    />
                    <TierGatedButton
                      href="/organizer/typology"
                      label="Typology Classifier"
                      icon="🏷️"
                      requiredTier="PRO"
                      className="bg-cyan-100 hover:bg-cyan-200 dark:bg-cyan-900/30 text-cyan-900 dark:text-cyan-100"
                    />
                    <TierGatedButton
                      href="/organizer/fraud-signals"
                      label="Fraud Signals"
                      icon="⚠️"
                      requiredTier="PRO"
                      className="bg-red-100 hover:bg-red-200 dark:bg-red-900/30 text-red-900 dark:text-red-100"
                    />
                    <TierGatedButton
                      href="/organizer/offline"
                      label="Offline Mode"
                      icon="📵"
                      requiredTier="PRO"
                      className="bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100"
                    />
                    <TierGatedButton
                      href="/organizer/appraisals"
                      label="Appraisals"
                      icon="💎"
                      requiredTier="PRO"
                      className="bg-yellow-100 hover:bg-yellow-200 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100"
                    />
                    <TierGatedButton
                      href="/organizer/brand-kit"
                      label="Brand Kit"
                      icon="🎨"
                      requiredTier="PRO"
                      className="bg-pink-100 hover:bg-pink-200 dark:bg-pink-900/30 text-pink-900 dark:text-pink-100"
                    />
                    <TierGatedButton
                      href="/organizer/item-library"
                      label="Item Library"
                      icon="📚"
                      requiredTier="PRO"
                      className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100"
                    />
                    <TierGatedButton
                      href="/organizer/flip-report"
                      label="Flip Report"
                      icon="📈"
                      requiredTier="PRO"
                      className="bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/30 text-rose-900 dark:text-rose-100"
                    />
                    <TierGatedButton
                      href="/api/organizers/export"
                      label="Export Data"
                      icon="↓"
                      requiredTier="PRO"
                      className="bg-cyan-100 hover:bg-cyan-200 dark:bg-cyan-900/30 text-cyan-900 dark:text-cyan-100"
                    />
                  </>
                )}
                {canAccess('TEAMS') && (
                  <TierGatedButton
                    href="/organizer/webhooks"
                    label="Webhooks"
                    icon="🔗"
                    requiredTier="TEAMS"
                    className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900/30 text-slate-900 dark:text-slate-100"
                  />
                )}
              </div>
            </details>

            {/* Section 4: Community (collapsible, closed by default) */}
            <details open={!isMobileView ? false : undefined}>
              <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 text-sm font-semibold uppercase text-warm-600 dark:text-warm-400 hover:bg-warm-100 dark:hover:bg-gray-700 rounded transition-colors">
                <span className="group-open:hidden">▶</span>
                <span className="hidden group-open:inline">▼</span>
                Community
              </summary>
              <div className="mt-3 ml-3 flex flex-wrap gap-4">
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
                <Link
                  href="/neighborhoods"
                  className="bg-teal-100 hover:bg-teal-200 dark:bg-teal-900/30 text-teal-900 dark:text-teal-100 font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  🏘️ Neighborhoods
                </Link>
                <Link
                  href="/organizer/performance"
                  className="bg-violet-100 hover:bg-violet-200 dark:bg-violet-900/30 text-violet-900 dark:text-violet-100 font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  📈 Performance
                </Link>
              </div>
            </details>

            {/* Section 5: Upgrade CTA for SIMPLE tier */}
            {isSimple && (
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg mt-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🔒</span>
                  <div className="flex-1">
                    <p className="font-semibold text-amber-900 dark:text-amber-100">Unlock Pro Features</p>
                    <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                      Save time. Understand what sells. Build a brand that brings shoppers back.
                    </p>
                    <Link
                      href="/organizer/premium?source=dashboard"
                      className="inline-block mt-3 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                    >
                      Upgrade to PRO
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-4 mb-8 border-b border-warm-200 dark:border-gray-700">
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="card p-6">
                  <p className="text-warm-600 dark:text-warm-300 text-sm">Active Sales</p>
                  <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{salesData?.length || 0}</p>
                </div>
                <div className="card p-6">
                  <p className="text-warm-600 dark:text-warm-300 text-sm">Total Items</p>
                  <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{(analyticsData?.itemsSold ?? 0) + (analyticsData?.itemsUnsold ?? 0)}</p>
                </div>
                <div className="card p-6">
                  <p className="text-warm-600 dark:text-warm-300 text-sm">Total Revenue</p>
                  <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">${animatedRevenue.toFixed(2)}</p>
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
              <div className="bg-white dark:bg-gray-800 dark:shadow-gray-900/50 rounded-lg shadow-md p-6 mb-6">
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">How It Works</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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

              {/* Phase 31: Tier Rewards card */}
              {tierData && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  <div className="bg-white dark:bg-gray-800 dark:shadow-gray-900/50 rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Your Tier</h3>
                    <div className="flex items-center gap-3 mb-3">
                      <OrganizerTierBadge tier={tierData.tier} />
                      <span className="text-sm font-semibold text-warm-800 dark:text-warm-200">{tierData.benefits.label}</span>
                    </div>
                    <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">{TIER_DESCRIPTIONS[tierData.tier] || ''}</p>
                    {tierData.benefits.perks.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-warm-500 dark:text-warm-400 uppercase tracking-wide mb-2">Perks</p>
                        <ul className="space-y-1">
                          {tierData.benefits.perks.map((perk) => (
                            <li key={perk} className="flex items-center gap-2 text-sm text-warm-700 dark:text-warm-300">
                              <span className="text-amber-600 dark:text-amber-400 flex-shrink-0">✓</span>{perk}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  {tierData.progress.nextTier && (
                    <div className="bg-white dark:bg-gray-800 dark:shadow-gray-900/50 rounded-lg shadow-md p-6">
                      <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-2">Progress to Next Tier</h3>
                      <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">Keep completing sales to reach <strong className="dark:text-warm-300">{tierData.progress.nextTier}</strong>.</p>
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-warm-700 dark:text-warm-300">Completed Sales</span>
                            <span className="text-sm text-warm-600 dark:text-warm-400">{tierData.progress.completedSales} / {tierData.progress.completedSales + tierData.progress.salesNeeded}</span>
                          </div>
                          <div className="w-full bg-warm-200 dark:bg-gray-700 rounded-full h-2">
                            <div className="bg-amber-600 h-2 rounded-full transition-all" style={{ width: tierData.progress.salesNeeded > 0 ? `${(tierData.progress.completedSales / (tierData.progress.completedSales + tierData.progress.salesNeeded)) * 100}%` : '100%' }} />
                          </div>
                          {tierData.progress.salesNeeded > 0 && <p className="text-xs text-warm-600 dark:text-warm-400 mt-1">{tierData.progress.salesNeeded} more {tierData.progress.salesNeeded === 1 ? 'sale' : 'sales'} needed</p>}
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-warm-700 dark:text-warm-300">Items Sold</span>
                            <span className="text-sm text-warm-600 dark:text-warm-400">{tierData.progress.soldItems} / {tierData.progress.soldItems + tierData.progress.itemsNeeded}</span>
                          </div>
                          <div className="w-full bg-warm-200 dark:bg-gray-700 rounded-full h-2">
                            <div className="bg-amber-600 h-2 rounded-full transition-all" style={{ width: tierData.progress.itemsNeeded > 0 ? `${(tierData.progress.soldItems / (tierData.progress.soldItems + tierData.progress.itemsNeeded)) * 100}%` : '100%' }} />
                          </div>
                          {tierData.progress.itemsNeeded > 0 && <p className="text-xs text-warm-600 dark:text-warm-400 mt-1">{tierData.progress.itemsNeeded} more {tierData.progress.itemsNeeded === 1 ? 'item' : 'items'} needed</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Phase 22: Creator Tier card */}
              {orgProfile && (
                <div className="bg-white dark:bg-gray-800 dark:shadow-gray-900/50 rounded-lg shadow-md p-6 mb-6">
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

              {/* Feature #71: Reputation Score card */}
              <div className="bg-white dark:bg-gray-800 dark:shadow-gray-900/50 rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-3">Reputation Score</h3>
                <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">Track your reputation metrics and community standing.</p>
                <Link
                  href="/organizer/reputation"
                  className="inline-block px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg font-medium transition-colors"
                >
                  View Reputation →
                </Link>
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
                <EmptyState icon="🏷️" heading="You haven't created any sales yet" subtext="Start by creating your first estate sale. Set up details, add inventory, and go live!" cta={{ label: 'Create Your First Sale', href: '/organizer/create-sale' }} />
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
