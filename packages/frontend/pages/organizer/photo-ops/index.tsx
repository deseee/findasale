/**
 * Photo Ops Landing Page
 *
 * Allows organizers to select a sale and set up photo opportunity stations
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import Head from 'next/head';
import Link from 'next/link';

interface Sale {
  id: string;
  title: string;
  saleType?: string;
  startDate: string;
  status: string; // DRAFT, PUBLISHED, UPCOMING, ENDED, ARCHIVED
  city?: string;
  state?: string;
}

const STATUS_BADGE_STYLES: Record<string, { bg: string; text: string }> = {
  PUBLISHED: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200' },
  UPCOMING: { bg: 'bg-amber-100 dark:bg-amber-900', text: 'text-amber-800 dark:text-amber-200' },
  DRAFT: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300' },
  ENDED: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300' },
  ARCHIVED: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300' },
};

const PhotoOpsLandingPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [retryCount, setRetryCount] = useState(0);

  // Auth guard
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // Fetch organizer's sales
  const { data: salesData, isLoading, isError, refetch } = useQuery<{ sales: Sale[] }>({
    queryKey: ['organizer-photo-ops-sales'],
    queryFn: async () => {
      const res = await api.get('/organizers/me/sales');
      return res.data;
    },
    enabled: !!user?.id,
  });

  const sales = salesData?.sales || [];

  // Filter to PUBLISHED, UPCOMING, and DRAFT only
  const availableSales = sales.filter(
    s => ['PUBLISHED', 'UPCOMING', 'DRAFT'].includes(s.status)
  );

  const handleSaleClick = (saleId: string) => {
    router.push(`/organizer/photo-ops/${saleId}`);
  };

  const handleRetry = () => {
    setRetryCount(retryCount + 1);
    refetch();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 dark:border-amber-400"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Photo Ops — FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header with breadcrumb */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-4">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <Link href="/organizer/dashboard" className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Photo Ops</h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-12">
          {/* Page title and explainer */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Choose a Sale
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Select a sale to set up photo opportunity stations and backdrops for your sale.
            </p>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-amber-600 dark:border-amber-400"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading your sales…</p>
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-xl p-6 text-center">
              <p className="text-red-800 dark:text-red-200 text-sm mb-3">
                Unable to load your sales. Please try again.
              </p>
              <button
                onClick={handleRetry}
                className="inline-block bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 text-sm font-medium"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !isError && availableSales.length === 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                No active sales. Start a new sale to use this tool.
              </p>
              <Link
                href="/organizer/create-sale"
                className="inline-block bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 text-sm font-medium"
              >
                Create a Sale
              </Link>
            </div>
          )}

          {/* Sales grid */}
          {!isLoading && !isError && availableSales.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableSales.map(sale => {
                const startDate = new Date(sale.startDate);
                const statusStyle = STATUS_BADGE_STYLES[sale.status] || STATUS_BADGE_STYLES.DRAFT;

                return (
                  <button
                    key={sale.id}
                    onClick={() => handleSaleClick(sale.id)}
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 hover:border-amber-400 dark:hover:border-amber-600 hover:shadow-lg dark:hover:shadow-amber-900/20 transition-all text-left"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex-1 text-sm">
                        {sale.title}
                      </h3>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${statusStyle.bg} ${statusStyle.text}`}>
                        {sale.status}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                      <p>
                        <span className="font-medium">Sale Type:</span> {sale.saleType || 'ESTATE'}
                      </p>
                      <p>
                        <span className="font-medium">Start Date:</span> {startDate.toLocaleDateString()}
                      </p>
                      {sale.city && sale.state && (
                        <p>
                          <span className="font-medium">Location:</span> {sale.city}, {sale.state}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        Set Up Photo Ops →
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PhotoOpsLandingPage;
