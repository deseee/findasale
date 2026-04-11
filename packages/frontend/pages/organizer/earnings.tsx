/**
 * Earnings Dashboard (#163 — SIMPLE tier)
 * Shows total revenue, fees, net earnings, and per-sale breakdown
 * Includes PDF export capability
 */

import React, { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import EmptyState from '../../components/EmptyState';

interface Sale {
  id: string;
  title: string;
  status: string;
  revenue: number;
  fees: number;
  itemsSold: number;
  itemsUnsold: number;
}

interface AnalyticsData {
  totalRevenue: number;
  totalFees: number;
  itemsSold: number;
  itemsUnsold: number;
  completedSalesCount: number;
  totalGMV: number;
  sales: Sale[];
}

const OrganizerEarningsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [isExporting, setIsExporting] = useState(false);

  if (authLoading) return null;
  if (!user || !user.roles?.includes('ORGANIZER')) {
    router.push('/login');
    return null;
  }

  // Fetch organizer profile (for subscriptionTier)
  const { data: organizerProfile } = useQuery({
    queryKey: ['organizer-profile'],
    queryFn: async () => {
      const response = await api.get('/organizers/me');
      return response.data as { id: string; subscriptionTier: string };
    },
    enabled: !!user?.id,
  });

  // Fetch analytics data
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useQuery({
    queryKey: ['organizer-earnings', year],
    queryFn: async () => {
      const response = await api.get('/organizers/me/analytics');
      return response.data as AnalyticsData;
    },
    enabled: !!user?.id,
  });

  // Filter sales by year for display
  const filteredSales = useMemo(() => {
    if (!analytics?.sales) return [];
    // In a production scenario, we'd filter by year from backend.
    // For now, show all since the backend doesn't partition by year in this endpoint.
    return analytics.sales.filter((s) => s.revenue > 0 || s.itemsSold > 0);
  }, [analytics?.sales]);

  // Compute totals
  const totals = useMemo(() => {
    return {
      revenue: filteredSales.reduce((sum, s) => sum + s.revenue, 0),
      fees: filteredSales.reduce((sum, s) => sum + s.fees, 0),
      itemsSold: filteredSales.reduce((sum, s) => sum + s.itemsSold, 0),
    };
  }, [filteredSales]);

  const netEarnings = totals.revenue - totals.fees;

  // Export PDF
  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      const response = await api.get(`/earnings/pdf?year=${year}`, {
        responseType: 'blob',
      });

      // Create download link
      const blob = new Blob([response.data], { type: 'text/html; charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `findasale-earnings-${year}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      showToast('PDF exported successfully', 'success');
    } catch (err: any) {
      console.error('PDF export error:', err);
      showToast(err.response?.data?.message || 'Failed to export PDF', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const previousYear = year - 1;
  const nextYear = year + 1;

  return (
    <>
      <Head>
        <title>Earnings Dashboard - FindA.Sale</title>
        <meta name="description" content="View your earnings, revenue breakdown, and sales analytics" />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <Link href="/organizer/dashboard" className="text-amber-600 dark:text-amber-500 hover:text-amber-800 dark:hover:text-amber-400 text-sm mb-2 inline-block">
                ← Dashboard
              </Link>
              <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100">Earnings Dashboard</h1>
              <p className="text-warm-600 dark:text-warm-400 text-sm mt-1">View your revenue and sales breakdown</p>
            </div>
          </div>

          {/* Year selector and export */}
          <div className="flex items-center justify-between mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-4">
              <label htmlFor="year-select" className="text-sm font-medium text-warm-700 dark:text-warm-300">
                Year:
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setYear(previousYear)}
                  className="px-3 py-1.5 text-sm border border-warm-300 dark:border-gray-700 rounded-md hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors text-warm-700 dark:text-warm-300"
                >
                  ← {previousYear}
                </button>
                <select
                  id="year-select"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value, 10))}
                  className="text-sm border border-warm-300 dark:border-gray-700 rounded-md px-3 py-1.5 bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100 focus:ring-amber-500 focus:border-amber-500"
                >
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setYear(nextYear)}
                  className="px-3 py-1.5 text-sm border border-warm-300 dark:border-gray-700 rounded-md hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors text-warm-700 dark:text-warm-300"
                >
                  {nextYear} →
                </button>
              </div>
            </div>

            <button
              onClick={handleExportPdf}
              disabled={isExporting || analyticsLoading}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
            >
              {isExporting ? 'Exporting...' : '📄 Export PDF'}
            </button>
          </div>

          {analyticsError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-700 dark:text-red-400">
                Failed to load earnings data. Please try again.
              </p>
            </div>
          )}

          {analyticsLoading ? (
            <p className="text-warm-600 dark:text-warm-400">Loading earnings data…</p>
          ) : filteredSales.length === 0 ? (
            <EmptyState
              icon="💰"
              heading="No sales yet"
              subtext="Once you complete your first sale, your earnings and revenue breakdown will appear here."
            />
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {/* Gross Revenue */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-warm-600 dark:text-warm-400">Gross Revenue</p>
                      <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">
                        ${totals.revenue.toFixed(2)}
                      </p>
                    </div>
                    <span className="text-4xl">💵</span>
                  </div>
                  <p className="text-xs text-warm-500 dark:text-warm-500 mt-3">
                    {totals.itemsSold} item{totals.itemsSold !== 1 ? 's' : ''} sold
                  </p>
                </div>

                {/* Platform Fees */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-warm-600 dark:text-warm-400">Platform Fees</p>
                      <p className="text-3xl font-bold text-red-600 dark:text-red-400 mt-2">
                        -${totals.fees.toFixed(2)}
                      </p>
                    </div>
                    <span className="text-4xl">📊</span>
                  </div>
                  <p className="text-xs text-warm-500 dark:text-warm-500 mt-3">
                    {((totals.fees / totals.revenue) * 100).toFixed(1)}% of gross revenue
                  </p>
                </div>

                {/* Net Earnings */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border-2 border-green-200 dark:border-green-900">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">Net Earnings</p>
                      <p className="text-3xl font-bold text-green-700 dark:text-green-400 mt-2">
                        ${netEarnings.toFixed(2)}
                      </p>
                    </div>
                    <span className="text-4xl">✨</span>
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-500 mt-3">
                    After all fees
                  </p>
                </div>
              </div>

              {/* Sales breakdown table */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
                <div className="px-6 py-4 border-b border-warm-200 dark:border-gray-700">
                  <h2 className="text-lg font-semibold text-warm-900 dark:text-warm-100">
                    Sales Breakdown ({filteredSales.length} sale{filteredSales.length !== 1 ? 's' : ''})
                  </h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-warm-50 dark:bg-gray-700 border-b border-warm-200 dark:border-gray-600">
                        <th className="text-left px-6 py-3 text-xs font-semibold text-warm-700 dark:text-warm-300 uppercase tracking-wide">
                          Sale Name
                        </th>
                        <th className="text-center px-6 py-3 text-xs font-semibold text-warm-700 dark:text-warm-300 uppercase tracking-wide">
                          Items Sold
                        </th>
                        <th className="text-right px-6 py-3 text-xs font-semibold text-warm-700 dark:text-warm-300 uppercase tracking-wide">
                          Revenue
                        </th>
                        <th className="text-right px-6 py-3 text-xs font-semibold text-warm-700 dark:text-warm-300 uppercase tracking-wide">
                          Fees
                        </th>
                        <th className="text-right px-6 py-3 text-xs font-semibold text-warm-700 dark:text-warm-300 uppercase tracking-wide">
                          Net
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-100 dark:divide-gray-700">
                      {filteredSales.map((sale) => (
                        <tr
                          key={sale.id}
                          className="hover:bg-warm-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <Link
                              href={`/organizer/sales/${sale.id}`}
                              className="font-medium text-warm-900 dark:text-warm-100 hover:text-amber-600 dark:hover:text-amber-400 line-clamp-1"
                            >
                              {sale.title}
                            </Link>
                            <p className="text-xs text-warm-500 dark:text-warm-400 mt-0.5">
                              {sale.status}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-center text-sm font-medium text-warm-900 dark:text-warm-100">
                            {sale.itemsSold}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-medium text-warm-900 dark:text-warm-100">
                            ${sale.revenue.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-medium text-red-600 dark:text-red-400">
                            -${sale.fees.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-bold text-green-700 dark:text-green-400">
                            ${(sale.revenue - sale.fees).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Table footer with totals */}
                <div className="bg-warm-50 dark:bg-gray-700 border-t border-warm-200 dark:border-gray-600 px-6 py-4">
                  <div className="flex justify-end gap-12">
                    <div className="text-right">
                      <p className="text-xs font-semibold text-warm-600 dark:text-warm-400 uppercase tracking-wide">
                        Total Revenue
                      </p>
                      <p className="text-lg font-bold text-warm-900 dark:text-warm-100 mt-1">
                        ${totals.revenue.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-warm-600 dark:text-warm-400 uppercase tracking-wide">
                        Total Fees
                      </p>
                      <p className="text-lg font-bold text-red-600 dark:text-red-400 mt-1">
                        -${totals.fees.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">
                        Net Earnings
                      </p>
                      <p className="text-lg font-bold text-green-700 dark:text-green-400 mt-1">
                        ${netEarnings.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Info footer */}
              <div className="mt-8 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Platform Fee:</strong> {organizerProfile?.subscriptionTier === 'PRO' || organizerProfile?.subscriptionTier === 'TEAMS' ? '8%' : '10%'} of each completed sale. Fees are deducted from your gross revenue to calculate net earnings.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default OrganizerEarningsPage;
