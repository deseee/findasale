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

interface QRFunnelData {
  saleId: string;
  funnel: {
    totalScanInitiated: number;
    decodedOnDomain: number;
    decodedOffDomain: number;
    cameraDenied: number;
    conversionRate: number;
  };
  uniqueShoppers: number;
  mobileScans: number;
  desktopScans: number;
}

const QRCodesPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [activeSaleId, setActiveSaleId] = React.useState<string | null>(null);

  // Fetch organizer's sales
  const { data: salesData = [], isLoading: salesLoading } = useQuery<SaleData[]>({
    queryKey: ['organizer-sales-qr'],
    queryFn: async () => {
      const res = await api.get('/organizers/me/sales');
      return (res.data as SalesResponse).data || res.data || [];
    },
    enabled: !!user,
  });

  // Set active sale to the first sale (or first active sale)
  React.useEffect(() => {
    if (salesData.length > 0 && !activeSaleId) {
      // Prefer an active sale, otherwise just use the first one
      const activeSale = salesData.find(
        (sale) => sale.status === 'PUBLISHED' && isAfter(parseISO(sale.endDate), new Date())
      );
      setActiveSaleId(activeSale?.id || salesData[0].id);
    }
  }, [salesData, activeSaleId]);

  // Fetch QR funnel data for the active sale
  const { data: funnelData, isLoading: funnelLoading } = useQuery<QRFunnelData>({
    queryKey: ['qr-funnel', activeSaleId],
    queryFn: async () => {
      const res = await api.get(`/qr-scanner/funnel?saleId=${activeSaleId}&days=7`);
      return res.data;
    },
    enabled: !!activeSaleId,
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

          {/* Scanner Funnel Card (Last 7 Days) */}
          <div className="mb-12 p-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold mb-2">Scanner Funnel (Last 7 Days)</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {activeSaleId && salesData.find(s => s.id === activeSaleId)?.title}
                </p>
              </div>
            </div>

            {funnelLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </div>
            ) : funnelData && funnelData.funnel.totalScanInitiated > 0 ? (
              <div className="space-y-4">
                {/* Scan Initiated */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Scan Initiated
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {funnelData.funnel.totalScanInitiated}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                {/* Landed on Site */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Landed on Site
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {funnelData.funnel.decodedOnDomain}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500"
                      style={{
                        width: `${(funnelData.funnel.decodedOnDomain / funnelData.funnel.totalScanInitiated) * 100}%`
                      }}
                    />
                  </div>
                </div>

                {/* Camera Denied */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Camera Denied
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {funnelData.funnel.cameraDenied}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500"
                      style={{
                        width: `${(funnelData.funnel.cameraDenied / funnelData.funnel.totalScanInitiated) * 100}%`
                      }}
                    />
                  </div>
                </div>

                {/* Off Domain */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Left Site
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {funnelData.funnel.decodedOffDomain}
                    </span>
                  </div>
                  <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500"
                      style={{
                        width: `${(funnelData.funnel.decodedOffDomain / funnelData.funnel.totalScanInitiated) * 100}%`
                      }}
                    />
                  </div>
                </div>

                {/* Conversion Rate Headline */}
                <div className="mt-6 p-4 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    CONVERSION RATE
                  </div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                    {funnelData.funnel.conversionRate}%
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {funnelData.funnel.decodedOnDomain} of {funnelData.funnel.totalScanInitiated} scans landed on site
                  </p>
                </div>

                {/* Device Breakdown */}
                {(funnelData.mobileScans > 0 || funnelData.desktopScans > 0) && (
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Mobile
                      </div>
                      <div className="text-lg font-bold text-slate-900 dark:text-slate-50">
                        {funnelData.mobileScans}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Desktop
                      </div>
                      <div className="text-lg font-bold text-slate-900 dark:text-slate-50">
                        {funnelData.desktopScans}
                      </div>
                    </div>
                  </div>
                )}

                {/* Unique Shoppers */}
                {funnelData.uniqueShoppers > 0 && (
                  <div className="mt-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Unique Shoppers
                    </div>
                    <div className="text-lg font-bold text-slate-900 dark:text-slate-50">
                      {funnelData.uniqueShoppers}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50">
                <p className="text-sm text-amber-700 dark:text-amber-200">
                  No scanner data yet — share your sale QR code to start tracking engagement.
                </p>
              </div>
            )}
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
