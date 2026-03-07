/**
 * Organizer Dashboard (Updated)
 *
 * This is the main hub for organizers to:
 * - View all their sales
 * - Create new sales
 * - Manage items
 * - View analytics and earnings
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import SaleCard from '../../components/SaleCard';
import ReputationTier from '../../components/ReputationTier'; // Phase 22
import OrganizerTierBadge from '../../components/OrganizerTierBadge'; // Phase 31: Tier Rewards
import SaleQRCode from '../../components/SaleQRCode'; // CD2-P2
import FlashDealForm from '../../components/FlashDealForm';
import OnboardingWizard from '../../components/OnboardingWizard'; // Onboarding wizard
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

const OrganizerDashboard = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'analytics'>('overview');
  const [openQRSale, setOpenQRSale] = useState<string | null>(null); // CD2-P2
  const [flashDealSaleId, setFlashDealSaleId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [cloningId, setCloningId] = useState<string | null>(null);

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

  // Show wizard if onboarding not complete and not dismissed
  useEffect(() => {
    if (orgProfile && !orgProfile.onboardingComplete && localStorage.getItem('onboardingDismissed') !== 'true') {
      setShowWizard(true);
    }
  }, [orgProfile]);

  // Handle sale cloning
  const handleCloneSale = async (saleId: string) => {
    setCloningId(saleId);
    try {
      const response = await api.post(`/sales/${saleId}/clone`);
      const newSaleId = response.data.id;
      // Redirect to edit the cloned sale
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
      const response = await api.get('/api/tiers/mine');
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

  return (
    <>
      <Head>
        <title>Organizer Dashboard - FindA.Sale</title>
      </Head>

      {/* Onboarding Wizard */}
      {showWizard && (
        <OnboardingWizard
          onComplete={() => {
            setShowWizard(false);
          }}
        />
      )}

      <div className="min-h-screen bg-warm-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-warm-900 mb-2">Welcome, {user?.businessName || user?.firstName}</h1>
            <p className="text-warm-600">Manage your estate sales and track earnings.</p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4 mb-8">
            <Link
              href="/organizer/create-sale"
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
            >
              + Create New Sale
            </Link>
            <Link
              href="/organizer/add-items"
              className="bg-warm-200 hover:bg-warm-300 text-warm-900 font-bold py-2 px-6 rounded-lg transition-colors"
            >
              Add Items
            </Link>
            <Link
              href="/organizer/holds"
              className="bg-warm-200 hover:bg-warm-300 text-warm-900 font-bold py-2 px-6 rounded-lg transition-colors"
            >
              Manage Holds
            </Link>
            <Link
              href="/organizer/insights"
              className="bg-indigo-100 hover:bg-indigo-200 text-indigo-900 font-bold py-2 px-6 rounded-lg transition-colors"
            >
              Insights
            </Link>
            <Link
              href="/organizer/print-inventory"
              className="bg-purple-100 hover:bg-purple-200 text-purple-900 font-bold py-2 px-6 rounded-lg transition-colors"
            >
              🖨️ Print Inventory
            </Link>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-4 mb-8 border-b border-warm-200">
            {['overview', 'sales', 'analytics'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`pb-2 font-medium capitalize ${
                  activeTab === tab
                    ? 'border-b-2 border-amber-600 text-amber-600'
                    : 'text-warm-600 hover:text-warm-900'
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
                  <p className="text-warm-600 text-sm">Active Sales</p>
                  <p className="text-3xl font-bold text-warm-900">{salesData?.length || 0}</p>
                </div>
                <div className="card p-6">
                  <p className="text-warm-600 text-sm">Total Items</p>
                  <p className="text-3xl font-bold text-warm-900">{analyticsData?.itemsSold + analyticsData?.itemsUnsold || 0}</p>
                </div>
                <div className="card p-6">
                  <p className="text-warm-600 text-sm">Total Revenue</p>
                  <p className="text-3xl font-bold text-warm-900">${(analyticsData?.totalRevenue || 0).toFixed(2)}</p>
                </div>
              </div>

              {/* Phase 31: Organizer Tier Rewards card */}
              {tierData && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* Tier Rewards section */}
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold text-warm-900 mb-4">Tier Rewards</h3>
                    <div className="flex items-center gap-3 mb-4">
                      <OrganizerTierBadge tier={tierData.tier} />
                      <span className="text-sm text-warm-600 font-medium">{tierData.benefits.label}</span>
                    </div>
                    <div className="bg-amber-50 rounded p-3 mb-4">
                      <p className="text-sm text-warm-900 font-semibold mb-2">Platform Fees</p>
                      <p className="text-sm text-warm-700">
                        Standard: {tierData.benefits.feePct}% | Auction: {tierData.benefits.auctionFeePct}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-2">Perks</p>
                      <ul className="space-y-1">
                        {tierData.benefits.perks.map((perk) => (
                          <li key={perk} className="flex items-center gap-2 text-sm text-warm-700">
                            <span className="text-amber-600 flex-shrink-0">✓</span>
                            {perk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Progress to next tier */}
                  {tierData.progress.nextTier && (
                    <div className="bg-white rounded-lg shadow-md p-6">
                      <h3 className="text-lg font-semibold text-warm-900 mb-4">Progress to Next Tier</h3>
                      <p className="text-sm text-warm-600 mb-4">
                        Upgrade to <strong>{tierData.progress.nextTier}</strong> and get better rates!
                      </p>
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-warm-700">Completed Sales</span>
                            <span className="text-sm text-warm-600">
                              {tierData.progress.completedSales} / {tierData.progress.completedSales + tierData.progress.salesNeeded}
                            </span>
                          </div>
                          <div className="w-full bg-warm-200 rounded-full h-2">
                            <div
                              className="bg-amber-600 h-2 rounded-full transition-all"
                              style={{
                                width: tierData.progress.salesNeeded > 0
                                  ? `${(tierData.progress.completedSales / (tierData.progress.completedSales + tierData.progress.salesNeeded)) * 100}%`
                                  : '100%',
                              }}
                            />
                          </div>
                          {tierData.progress.salesNeeded > 0 && (
                            <p className="text-xs text-warm-600 mt-1">
                              {tierData.progress.salesNeeded} more {tierData.progress.salesNeeded === 1 ? 'sale' : 'sales'} needed
                            </p>
                          )}
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-warm-700">Items Sold</span>
                            <span className="text-sm text-warm-600">
                              {tierData.progress.soldItems} / {tierData.progress.soldItems + tierData.progress.itemsNeeded}
                            </span>
                          </div>
                          <div className="w-full bg-warm-200 rounded-full h-2">
                            <div
                              className="bg-amber-600 h-2 rounded-full transition-all"
                              style={{
                                width: tierData.progress.itemsNeeded > 0
                                  ? `${(tierData.progress.soldItems / (tierData.progress.soldItems + tierData.progress.itemsNeeded)) * 100}%`
                                  : '100%',
                              }}
                            />
                          </div>
                          {tierData.progress.itemsNeeded > 0 && (
                            <p className="text-xs text-warm-600 mt-1">
                              {tierData.progress.itemsNeeded} more {tierData.progress.itemsNeeded === 1 ? 'item' : 'items'} needed
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Phase 22: Creator Tier card */}
              {orgProfile && (
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold text-warm-900 mb-3">Creator Tier</h3>
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <ReputationTier tier={orgProfile.reputationTier} size="sm" />
                    <p className="text-sm text-warm-600">{orgProfile.progressMessage}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-warm-900">{orgProfile.completedSales}</p>
                      <p className="text-xs text-warm-500">Completed Sales</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-warm-900">{orgProfile.followerCount}</p>
                      <p className="text-xs text-warm-500">Followers</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-warm-900">
                        {orgProfile.avgRating ? orgProfile.avgRating.toFixed(1) : '—'}
                      </p>
                      <p className="text-xs text-warm-500">Avg Rating</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-2">Your tier benefits</p>
                    <ul className="space-y-1">
                      {(TIER_BENEFITS[orgProfile.reputationTier] || TIER_BENEFITS.NEW).map((benefit) => (
                        <li key={benefit} className="flex items-center gap-2 text-sm text-warm-700">
                          <span className="text-green-500 flex-shrink-0">✓</span>
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'sales' && (
            <>
              {salesLoading ? (
                <p>Loading your sales...</p>
              ) : salesData && salesData.length > 0 ? (
                <div className="space-y-6">
                  {salesData.map((sale: any) => (
                    <div key={sale.id}>
                      <div className="card overflow-hidden hover:shadow-lg transition-shadow">
                        <div className="p-4">
                          <h3 className="text-lg font-semibold text-warm-900 mb-2">{sale.title}</h3>
                          <p className="text-sm text-warm-600 mb-4">{sale.city}, {sale.state}</p>
                          <div className="flex gap-2 flex-wrap items-center">
                            <Link
                              href={`/sales/${sale.id}`}
                              className="text-sm text-amber-600 hover:underline font-semibold"
                            >
                              View Sale
                            </Link>
                            <Link
                              href={`/organizer/edit-sale/${sale.id}`}
                              className="text-sm text-amber-600 hover:underline"
                            >
                              Edit
                            </Link>
                            <Link
                              href={`/organizer/add-items/${sale.id}`}
                              className="text-sm text-amber-600 hover:underline"
                            >
                              Items
                            </Link>
                            <button
                              onClick={() => setOpenQRSale(openQRSale === sale.id ? null : sale.id)}
                              className="text-sm text-amber-600 hover:underline"
                            >
                              {openQRSale === sale.id ? 'Hide QR' : 'QR Code'}
                            </button>
                            <button
                              onClick={() => handleCloneSale(sale.id)}
                              disabled={cloningId === sale.id}
                              className="text-sm text-amber-600 hover:underline disabled:opacity-50"
                            >
                              {cloningId === sale.id ? 'Cloning...' : 'Clone'}
                            </button>
                            <button
                              onClick={() => setFlashDealSaleId(flashDealSaleId === sale.id ? null : sale.id)}
                              className="text-sm text-red-600 hover:underline font-semibold"
                            >
                              {flashDealSaleId === sale.id ? 'Cancel Deal' : '⚡ Flash Deal'}
                            </button>
                          </div>
                          {openQRSale === sale.id && (
                            <div className="mt-4 pt-4 border-t border-warm-100">
                              <SaleQRCode saleId={sale.id} saleTitle={sale.title} size={160} />
                            </div>
                          )}
                          {flashDealSaleId === sale.id && sale.items && (
                            <div className="mt-4 pt-4 border-t border-warm-100">
                              <FlashDealForm
                                saleId={sale.id}
                                saleItems={sale.items}
                                onSuccess={() => {
                                  setFlashDealSaleId(null);
                                }}
                                onCancel={() => setFlashDealSaleId(null)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon="🏷️"
                  heading="You haven't created any sales yet"
                  subtext="Start by creating your first estate sale. Set up details, add inventory, and go live!"
                  cta={{ label: 'Create Your First Sale', href: '/organizer/create-sale' }}
                />
              )}
            </>
          )}

          {activeTab === 'analytics' && (
            <div className="text-center py-16">
              <p className="text-warm-600 text-lg mb-4">Advanced analytics dashboard coming soon</p>
              <p className="text-warm-500 text-sm">Check back soon for detailed insights and performance metrics</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default OrganizerDashboard;