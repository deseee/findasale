/**
 * QR Scan Analytics Page (#186)
 * Track QR code engagement across sales
 */

import React, { useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import EmptyState from '../../components/EmptyState';
import Skeleton from '../../components/Skeleton';
import { ArrowRight } from 'lucide-react';
import { formatDistanceToNow, parseISO, isAfter, isToday } from 'date-fns';

interface SaleData {
  id: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
  qrScanCount: number;
}

interface SalesResponse {
  data?: SaleData[];
  message?: string;
}

const QRCodesPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // Fetch organizer's sales
  const { data: salesData = [], isLoading: salesLoading } = useQuery<SaleData[]>({
    queryKey: ['organizer-sales-qr'],
    queryFn: async () => {
      const res = await api.get('/organizers/me/sales');
      return (res.data as SalesResponse).data || res.data || [];
    },
    enabled: !!user,
  });

  // Calculate summary metrics
  const metrics = useMemo(() => {
    const totalScans = salesData.reduce((sum, sale) => sum + sale.qrScanCount, 0);
    const activeSales = salesData.filter(
      (sale) => sale.status === 'PUBLISHED' && isAfter(parseISO(sale.endDate), new Date())
    );
    const activeScans = activeSales.reduce((sum, sale) => sum + sale.qrScanCount, 0);
    const salesWithScans = salesData.filter((sale) => sale.qrScanCount > 0).length;

    return { totalScans, activeScans, salesWithScans };
  }, [salesData]);

  // Sort sales by scan count descending
  const sortedSales = useMemo(() => {
    return [...salesData].sort((a, b) => b.qrScanCount - a.qrScanCount);
  }, [salesData]);

  // Check auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <Skeleton className="h-12 w-64 mb-4" />
          <Skeleton className="h-6 w-96 mb-12" />
          <div className="grid grid-cols-3 gap-4 mb-12">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!user || (user.role !== 'ORGANIZER' && !user.roles?.includes('ORGANIZER'))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-slate-950">
        <div className="text-center">
          <p className="text-slate-600 dark:text-slate-400 mb-4">Organizer access required.</p>
          <Link href="/auth/login">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              Sign In
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>QR Scan Analytics - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-50">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
          <div className="max-w-4xl mx-auto px-4 py-12">
            <h1 className="text-4xl font-bold mb-2">QR Scan Analytics</h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 mb-6">
              See how shoppers are engaging with your item and sale QR codes
            </p>
            <Link href="/organizer/print-kit">
              <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                Need more labels? <ArrowRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-12">
          {/* Summary Metrics Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {/* Total QR Scans */}
            <div className="p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <div className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">
                Total QR Scans (Lifetime)
              </div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                {salesLoading ? <Skeleton className="h-10 w-20" /> : metrics.totalScans}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">across all sales</p>
            </div>

            {/* Active Sale Scans */}
            <div className="p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <div className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">
                Active Sale Scans
              </div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                {salesLoading ? <Skeleton className="h-10 w-20" /> : metrics.activeScans}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">currently ongoing sales</p>
            </div>

            {/* Sales with QR Labels */}
            <div className="p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <div className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">
                Sales with QR Labels
              </div>
              <div className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                {salesLoading ? <Skeleton className="h-10 w-20" /> : metrics.salesWithScans}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                {metrics.salesWithScans === 1 ? 'sale has' : 'sales have'} scans
              </p>
            </div>
          </div>

          {/* Per-Sale Breakdown */}
          {salesLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : sortedSales.length === 0 ? (
            <EmptyState
              heading="No sales yet"
              subtext="Create your first sale to start tracking QR engagement."
              cta={{
                label: 'Create Sale',
                href: '/organizer/create-sale'
              }}
            />
          ) : (
            <div>
              <h2 className="text-xl font-bold mb-6">Sales Breakdown</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                        Sale Name
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                        Sale Date
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                        Status
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                        QR Scans
                      </th>
                      <th className="text-right py-3 px-4 font-semibold text-slate-600 dark:text-slate-400">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSales.map((sale, idx) => {
                      const isActive =
                        sale.status === 'PUBLISHED' &&
                        isAfter(parseISO(sale.endDate), new Date());
                      const hasScans = sale.qrScanCount > 0;

                      return (
                        <tr
                          key={sale.id}
                          className={`border-b border-slate-100 dark:border-slate-800 ${
                            !hasScans
                              ? 'bg-slate-50 dark:bg-slate-900/25 opacity-60'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                          } transition`}
                        >
                          <td className="py-3 px-4 font-medium">{sale.title}</td>
                          <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-400">
                            {formatDistanceToNow(parseISO(sale.startDate), { addSuffix: true })}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                isActive
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : sale.status === 'DRAFT'
                                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {sale.status === 'DRAFT'
                                ? 'Draft'
                                : isActive
                                ? 'Active'
                                : 'Ended'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold">
                            {sale.qrScanCount}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Link href="/organizer/print-kit">
                              <button className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                Print Labels <ArrowRight className="w-3 h-3" />
                              </button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Empty state for zero scans */}
              {metrics.totalScans === 0 && (
                <div className="mt-8 p-6 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-center">
                  <p className="text-slate-600 dark:text-slate-400">
                    No scans yet — print QR labels and attach them to your items!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Explainer Section */}
          <div className="mt-16 p-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/50">
            <h3 className="text-lg font-semibold mb-4">How QR Scans Work</h3>
            <div className="space-y-3">
              <div className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-blue-600 text-white font-bold text-sm">
                  1
                </div>
                <div>
                  <p className="font-medium">Print labels via Print Kit</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Generate custom QR codes with your sale branding
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-blue-600 text-white font-bold text-sm">
                  2
                </div>
                <div>
                  <p className="font-medium">Attach to items at your sale</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Place labels on shelves, price tags, or item displays
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-blue-600 text-white font-bold text-sm">
                  3
                </div>
                <div>
                  <p className="font-medium">Shoppers scan to engage</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Customers view details, place holds, or proceed to checkout
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
              Each scan is counted when a shopper views your item or records their attendance.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default QRCodesPage;
