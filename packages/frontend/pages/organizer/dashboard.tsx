/**
 * Organizer Dashboard (Updated)
 *
 * This is the main hub for organizers to:
 * - View all their sales
 * - Create new sales
 * - Manage items
 * - View analytics and earnings
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import SaleCard from '../../components/SaleCard';
import ReputationTier from '../../components/ReputationTier'; // Phase 22
import Head from 'next/head';
import Link from 'next/link';

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
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'analytics'>('overview');

  // Redirect if not authenticated or not an organizer
  if (!loading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  // Fetch organizer's sales
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ['organizer-sales', user?.id],
    queryFn: async () => {
      const response = await api.get('/organizer/sales');
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
      };
    },
    enabled: !!user?.id,
  });

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <>
      <Head>
        <title>Organizer Dashboard - FindA.Sale</title>
      </Head>
      <div className="min-h-screen bg-warm-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-warm-900 mb-2">Welcome, {user?.businessName || user?.firstName}</h1>
            <p className="text-warm-600">Manage your estate sales and track earnings.</p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 mb-8">
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
                  <p className="text-3xl font-bold text-warm-900">—</p>
                </div>
                <div className="card p-6">
                  <p className="text-warm-600 text-sm">Earnings (30d)</p>
                  <p className="text-3xl font-bold text-warm-900">—</p>
                </div>
              </div>

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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {salesData.map((sale: any) => (
                    <div key={sale.id} className="card overflow-hidden hover:shadow-lg transition-shadow">
                      <div className="p-4">
                        <h3 className="text-lg font-semibold text-warm-900 mb-2">{sale.title}</h3>
                        <p className="text-sm text-warm-600 mb-4">{sale.city}, {sale.state}</p>
                        <div className="flex gap-2">
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
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-warm-600 mb-4">No sales yet. Create your first one to get started!</p>
                  <Link
                    href="/organizer/create-sale"
                    className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg"
                  >
                    Create Sale
                  </Link>
                </div>
              )}
            </>
          )}

          {activeTab === 'analytics' && <div className="text-warm-600">Analytics coming soon...</div>}
        </div>
      </div>
    </>
  );
};

export default OrganizerDashboard;
