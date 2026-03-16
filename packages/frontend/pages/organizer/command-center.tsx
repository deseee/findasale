/**
 * Command Center Dashboard
 *
 * Multi-sale overview for PRO/TEAMS organizers.
 * Route: /organizer/command-center
 * Tier gating: PRO minimum (SIMPLE redirected to /organizer/upgrade)
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';
import { useCommandCenter } from '../../hooks/useCommandCenter';
import { useToast } from '../../components/ToastContext';
import CommandCenterCard from '../../components/CommandCenterCard';
import Skeleton from '../../components/Skeleton';

type StatusFilter = 'active' | 'upcoming' | 'recent' | 'all';

const CommandCenterPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { canAccess } = useOrganizerTier();
  const { showToast } = useToast();
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('active');

  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  if (!authLoading && user && !canAccess('PRO')) {
    router.push('/organizer/upgrade');
    return null;
  }

  const { data, isLoading, error, refetch } = useCommandCenter(selectedStatus);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-warm-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm mb-4 inline-block">
            ← Dashboard
          </Link>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-red-700 font-semibold mb-4">Failed to load Command Center</p>
            <button
              onClick={() => refetch()}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="mb-8">
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
          </div>
          <div className="flex gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-24" />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64" />)}
          </div>
        </div>
      </div>
    );
  }

  const summary = data?.summary;
  const sales = data?.sales || [];

  return (
    <>
      <Head>
        <title>Command Center - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50">
        <div className="bg-white border-b border-warm-200 px-4 py-4 mb-8">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <Link href="/organizer/dashboard" className="text-warm-400 hover:text-warm-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-warm-300">/</span>
            <h1 className="text-lg font-semibold text-warm-900">Command Center</h1>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-warm-900 mb-2">Multi-Sale Command Center</h2>
            <p className="text-warm-600">View all your active sales and manage across multiple listings at once.</p>
          </div>

          {summary && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-md p-6">
                <p className="text-warm-600 text-xs font-semibold uppercase tracking-wide mb-2">Active Sales</p>
                <p className="text-3xl font-bold text-warm-900">{summary.totalActiveSales}</p>
                <p className="text-xs text-warm-500 mt-2">Currently live</p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <p className="text-warm-600 text-xs font-semibold uppercase tracking-wide mb-2">Total Items</p>
                <p className="text-3xl font-bold text-warm-900">{summary.totalItems}</p>
                <p className="text-xs text-warm-500 mt-2">Across all sales</p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <p className="text-warm-600 text-xs font-semibold uppercase tracking-wide mb-2">Total Revenue</p>
                <p className="text-3xl font-bold text-green-700">${summary.totalRevenue.toFixed(2)}</p>
                <p className="text-xs text-warm-500 mt-2">From all sales</p>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <p className="text-warm-600 text-xs font-semibold uppercase tracking-wide mb-2">Pending Actions</p>
                <p className={`text-3xl font-bold ${summary.totalPendingActions > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {summary.totalPendingActions}
                </p>
                <p className="text-xs text-warm-500 mt-2">Across all sales</p>
              </div>
            </div>
          )}

          <div className="flex gap-2 mb-8 border-b border-warm-200">
            {(['active', 'upcoming', 'recent', 'all'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setSelectedStatus(status)}
                className={`pb-3 px-1 font-medium capitalize border-b-2 transition-colors ${
                  selectedStatus === status
                    ? 'border-amber-600 text-amber-600'
                    : 'border-transparent text-warm-600 hover:text-warm-900'
                }`}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          {sales.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {sales.map((sale) => (
                <CommandCenterCard key={sale.id} sale={sale} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <p className="text-warm-600 mb-6">
                {selectedStatus === 'active' && 'No active sales right now. Create one to get started.'}
                {selectedStatus === 'upcoming' && 'No upcoming sales. Schedule a sale to see it here.'}
                {selectedStatus === 'recent' && 'No recent sales. Your completed sales will appear here.'}
                {selectedStatus === 'all' && 'No sales yet. Create your first sale to begin.'}
              </p>
              <Link
                href="/organizer/dashboard"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CommandCenterPage;
