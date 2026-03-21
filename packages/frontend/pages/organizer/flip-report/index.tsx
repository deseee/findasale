/**
 * Flip Report Index Page
 * Route: /organizer/flip-report
 *
 * If organizer has exactly one sale, redirects to /organizer/flip-report/[saleId]
 * If organizer has multiple sales, shows a sale-picker UI
 * If organizer has no sales, shows empty state with link to create sale
 *
 * Tier: PRO minimum (enforced by TierGate)
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import TierGate from '../../../components/TierGate';
import Skeleton from '../../../components/Skeleton';
import Link from 'next/link';

interface Sale {
  id: string;
  title: string;
  status: string;
}

export default function FlipReportIndexPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // Redirect if not authenticated or not an organizer
  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Fetch user's sales
  const { data: salesData, isLoading: salesLoading } = useQuery<Sale[]>({
    queryKey: ['sales', 'mine'],
    queryFn: async () => {
      const res = await api.get('/sales/mine');
      return res.data.sales || [];
    },
    enabled: !!user && user.role === 'ORGANIZER',
  });

  // Auto-redirect if exactly one sale
  useEffect(() => {
    if (salesData && salesData.length === 1) {
      router.push(`/organizer/flip-report/${salesData[0].id}`);
    }
  }, [salesData, router]);

  if (authLoading || salesLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-12 w-64 mb-8" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'ORGANIZER') {
    return null;
  }

  return (
    <>
      <Head>
        <title>Flip Report - FindA.Sale</title>
        <meta name="description" content="View your flip reports to optimize pricing for future sales" />
      </Head>

      <TierGate requiredTier="PRO" featureName="Flip Report" description="See exactly what sold, at what price, and what to price next time. Flip Report turns your sale history into your next sale's strategy.">
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <Link href="/organizer/dashboard" className="text-blue-600 hover:underline text-sm font-medium mb-4 inline-block">
                ← Back to dashboard
              </Link>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Flip Report</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Analyze what sold and at what price to optimize pricing for your next sale.
              </p>
            </div>

            {/* No Sales State */}
            {salesData && salesData.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">No Sales Yet</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Create and complete a sale to view flip reports and analyze your pricing strategy.
                </p>
                <Link href="/organizer/create-sale" className="inline-block px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
                  Create Your First Sale
                </Link>
              </div>
            ) : (
              /* Sale Picker */
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Select a Sale</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Choose a sale to view its flip report and analyze your pricing.
                </p>

                <div className="space-y-3">
                  {salesData?.map((sale) => (
                    <button
                      key={sale.id}
                      onClick={() => router.push(`/organizer/flip-report/${sale.id}`)}
                      className="w-full text-left px-6 py-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{sale.title}</h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Status: {sale.status}</p>
                        </div>
                        <svg className="w-5 h-5 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </TierGate>
    </>
  );
}
