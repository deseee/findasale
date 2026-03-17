'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useOrganizerTier } from '../../../hooks/useOrganizerTier';
import { useFlipReport } from '../../../hooks/useFlipReport';
import { Skeleton } from '../../../components/Skeleton';

export default function FlipReportPage() {
  const router = useRouter();
  const { saleId } = router.query;
  const { canAccess } = useOrganizerTier();
  const { data: flipReport, isLoading, error } = useFlipReport(saleId as string | null);

  // Tier gating
  if (!canAccess('PRO')) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Flip Report</h1>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <p className="text-gray-700 mb-4">Flip Report is a PRO feature. Upgrade your plan to access post-sale analytics.</p>
            <button
              onClick={() => router.push('/organizer/upgrade')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg"
            >
              Upgrade to PRO
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <Skeleton className="h-10 w-64 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-64 mb-8" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Error</h1>
          <p className="text-gray-600">Unable to load flip report. Please try again.</p>
          <button onClick={() => router.back()} className="mt-4 text-blue-600 hover:text-blue-800 font-semibold">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!flipReport) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-gray-600">No data available</p>
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
  const formatDate = (date: string | Date) => new Date(date).toLocaleDateString();

  return (
    <>
      <Head>
        <title>Flip Report: {flipReport.saleTitle}</title>
        <meta name="description" content={`Post-sale analytics report for ${flipReport.saleTitle}`} />
      </Head>

      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 print:bg-white">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8 print:mb-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">{flipReport.saleTitle}</h1>
              <p className="text-gray-600 text-sm">
                {formatDate(flipReport.saleStartDate)} — {formatDate(flipReport.saleEndDate)}
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="bg-sage-green hover:bg-sage-green-dark text-white font-semibold py-2 px-4 rounded-lg print:hidden"
              style={{ backgroundColor: '#8FB897' }}
            >
              📄 Print Report
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Sell-Through Rate */}
            <div className="bg-white rounded-lg shadow p-6 print:border print:border-gray-300 print:shadow-none">
              <h3 className="text-gray-600 text-sm font-semibold mb-2">Sell-Through Rate</h3>
              <p className="text-4xl font-bold text-gray-900 mb-1">{flipReport.sellThroughRate.toFixed(1)}%</p>
              <p className="text-xs text-gray-500">of items sold</p>
            </div>

            {/* Total Revenue */}
            <div className="bg-white rounded-lg shadow p-6 print:border print:border-gray-300 print:shadow-none">
              <h3 className="text-gray-600 text-sm font-semibold mb-2">Total Revenue</h3>
              <p className="text-3xl font-bold text-gray-900 mb-1">{formatCurrency(flipReport.totalRevenue)}</p>
              <p className="text-xs text-gray-500">from all sales</p>
            </div>

            {/* Items Sold */}
            <div className="bg-white rounded-lg shadow p-6 print:border print:border-gray-300 print:shadow-none">
              <h3 className="text-gray-600 text-sm font-semibold mb-2">Items Sold</h3>
              <p className="text-4xl font-bold text-gray-900 mb-1">{flipReport.itemsSold}</p>
              <p className="text-xs text-gray-500">out of {flipReport.itemsSold + flipReport.itemsUnsold}</p>
            </div>

            {/* Items Unsold */}
            <div className="bg-white rounded-lg shadow p-6 print:border print:border-gray-300 print:shadow-none">
              <h3 className="text-gray-600 text-sm font-semibold mb-2">Items Unsold</h3>
              <p className="text-4xl font-bold text-gray-900 mb-1">{flipReport.itemsUnsold}</p>
              <p className="text-xs text-gray-500">available/reserved</p>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="bg-white rounded-lg shadow p-6 mb-8 print:border print:border-gray-300 print:shadow-none">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Category Breakdown</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 print:bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">Category</th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-700">Total</th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-700">Sold</th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-700">Rate</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {flipReport.categoryBreakdown.map((cat) => (
                    <tr key={cat.category} className="hover:bg-gray-50 print:hover:bg-transparent">
                      <td className="px-4 py-3 font-medium text-gray-900">{cat.category}</td>
                      <td className="px-4 py-3 text-center text-gray-700">{cat.total}</td>
                      <td className="px-4 py-3 text-center text-gray-700">{cat.sold}</td>
                      <td className="px-4 py-3 text-center text-gray-700">
                        <span style={{ color: '#8FB897' }} className="font-semibold">
                          {cat.total > 0 ? ((cat.sold / cat.total) * 100).toFixed(1) : 0}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(cat.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Performers */}
          {flipReport.topPerformers.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6 mb-8 print:border print:border-gray-300 print:shadow-none">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Top Performers</h2>
              <div className="space-y-4">
                {flipReport.topPerformers.map((item, idx) => (
                  <div key={item.id} className="flex items-center justify-between pb-4 border-b border-gray-200 last:border-0 print:border-gray-300">
                    <div className="flex-1">
                      <div className="flex items-baseline gap-3">
                        <span className="text-2xl font-bold text-gray-400">#{idx + 1}</span>
                        <div>
                          <p className="font-semibold text-gray-900">{item.title}</p>
                          <p className="text-sm text-gray-500">{item.category || 'Uncategorized'}</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-2xl font-bold" style={{ color: '#8FB897' }}>
                      {formatCurrency(item.finalPrice)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pricing Insights */}
          <div className="bg-white rounded-lg shadow p-6 mb-8 print:border print:border-gray-300 print:shadow-none">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Pricing Insights</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-gray-600 text-sm font-semibold mb-2">Average Asking Price</p>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(flipReport.pricingInsights.averageAskingPrice)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-600 text-sm font-semibold mb-2">Average Sale Price</p>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(flipReport.pricingInsights.averageSalePrice)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-600 text-sm font-semibold mb-2">Price Reduction Rate</p>
                <p className="text-3xl font-bold text-gray-900">{flipReport.pricingInsights.priceDropRate.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="bg-white rounded-lg shadow p-6 print:border print:border-gray-300 print:shadow-none">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Recommendations</h2>
            <ul className="space-y-3">
              {flipReport.recommendations.map((rec, idx) => (
                <li key={idx} className="flex gap-3">
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                    style={{ backgroundColor: '#8FB897' }}
                  >
                    ✓
                  </span>
                  <p className="text-gray-700">{rec}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Print Styles */}
          <style jsx>{`
            @media print {
              body {
                background: white;
              }
              .print\\:hidden {
                display: none;
              }
              .print\\:border {
                border: 1px solid #e5e7eb;
              }
              .print\\:shadow-none {
                box-shadow: none;
              }
              .print\\:bg-white {
                background-color: white;
              }
              .print\\:bg-gray-100 {
                background-color: #f3f4f6;
              }
              .print\\:hover\\:bg-transparent:hover {
                background-color: transparent !important;
              }
              .print\\:border-gray-300 {
                border-color: #d1d5db;
              }
            }
          `}</style>
        </div>
      </div>
    </>
  );
}
