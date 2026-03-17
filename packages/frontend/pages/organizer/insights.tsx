/**
 * Organizer Insights Dashboard
 *
 * CD2 Phase 3: Analytics for organizers showing:
 * - Key metrics: total sales, active sales, items listed, items sold, revenue
 * - Items by category breakdown (CSS bar chart)
 * - Top 5 items by price
 * - Conversion rate calculation
 */

import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';
import SaleSelector from '../../components/SaleSelector';
import DateRangeSelector from '../../components/DateRangeSelector';
import MetricsGrid from '../../components/PerformanceDashboard/MetricsGrid';
import TopItemsTable from '../../components/PerformanceDashboard/TopItemsTable';
import CategoryBreakdownChart from '../../components/PerformanceDashboard/CategoryBreakdownChart';
import HoldMetricsCard from '../../components/PerformanceDashboard/HoldMetricsCard';
import RecommendationsPanel from '../../components/PerformanceDashboard/RecommendationsPanel';
import PostPerformanceCard from '../../components/PostPerformanceCard'; // #18: Post Performance Analytics

interface Insights {
  totalSalesCount: number;
  activeSalesCount: number;
  totalItems: number;
  totalItemsSold: number;
  totalItemsAvailable: number;
  avgItemPrice: number;
  totalRevenue: number;
  conversionRate: number;
  topItems: Array<{
    id: string;
    title: string;
    price: number;
    category: string;
    status: string;
  }>;
  categoryBreakdown: Array<{
    category: string;
    count: number;
  }>;
  statusBreakdown: Array<{
    status: string;
    count: number;
  }>;
  salesList: Array<{
    id: string;
    title: string;
    status: string;
  }>;
}

interface PerformanceMetrics {
  success: boolean;
  organizerId: string;
  saleId: string;
  dateRange: {
    from: string;
    to: string;
    label: string;
  };
  metrics: {
    revenue: {
      total: number;
      currency: string;
      platformFeeAmount?: number;
      strikeThrough?: number;
      organiserNetRevenue: number;
      sourceCounts: {
        online: number;
        pos: number;
      };
    };
    itemMetrics: {
      topSellingItems: Array<{
        itemId: string;
        title: string;
        category: string;
        unitsSold: number;
        totalRevenue: number;
        avgPrice: number;
        healthScore: number;
      }>;
      categoryBreakdown: Array<{
        category: string;
        itemsListed: number;
        itemsSold: number;
        sellThroughRate: number;
        avgListPrice: number;
        avgSoldPrice: number;
        totalRevenue: number;
        healthScoreAvg: number;
      }>;
      aggregateHealthScore: number;
    };
    purchasingMetrics: {
      conversionRate: number;
      totalUniqueBuyers: number;
      averageCartValue: number;
      repeatBuyerRate: number;
    };
    holdMetrics: {
      holdsCreated: number;
      holdsExpired: number;
      holdsCancelled: number;
      holdsConverted: number;
      noShowRate: number;
    };
    recommendations: {
      seasonalPricingTips: Array<{
        category: string;
        basePrice: number;
        seasonalFactor: number;
        recommendedPrice: number;
        rationale: string;
        confidence: number;
      }>;
      actionItems: Array<{
        priority: 'high' | 'medium' | 'low';
        title: string;
        reason: string;
        estimate: string;
      }>;
    };
  };
  lastUpdated: string;
  cacheExpiry: string;
}

const OrganizerInsightsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [dateRange, setDateRange] = useState<string>('30d');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  // Redirect if not authenticated or not an organizer
  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  // Fetch aggregate insights data
  const { data: insights, isLoading: insightsLoading, error } = useQuery({
    queryKey: ['organizer-insights', user?.id],
    queryFn: async () => {
      const response = await api.get(`/insights/organizer`);
      return response.data as Insights;
    },
    enabled: !!user?.id,
  });

  // Fetch per-sale performance metrics
  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['performance-metrics', selectedSaleId, dateRange, customFrom, customTo],
    queryFn: async () => {
      if (!selectedSaleId) return null;

      let url = `/organizers/performance?saleId=${selectedSaleId}&range=${dateRange}`;
      if (dateRange === 'custom' && customFrom && customTo) {
        url += `&from=${customFrom.toISOString()}&to=${customTo.toISOString()}`;
      }

      const response = await api.get(url);
      return response.data as PerformanceMetrics;
    },
    enabled: !!selectedSaleId && !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch post performance stats for the selected sale (#18)
  const { data: clickStats, isLoading: clickStatsLoading } = useQuery({
    queryKey: ['click-stats', selectedSaleId],
    queryFn: async () => {
      if (!selectedSaleId) return null;
      const response = await api.get(`/link-clicks/stats/${selectedSaleId}`);
      return response.data?.stats || null;
    },
    enabled: !!selectedSaleId && !!user?.id,
  });

  // Fetch organizer's sales to pre-select first sale
  const { data: sales = [] } = useQuery({
    queryKey: ['organizer-sales-insights'],
    queryFn: async () => {
      const response = await api.get('/sales/mine');
      return (response.data?.sales || []) as Array<{ id: string; title: string }>;
    },
    enabled: !!user?.id,
  });

  const handleSaleChange = (saleId: string) => {
    setSelectedSaleId(saleId);
  };

  const handleDateRangeChange = (range: string, from?: Date, to?: Date) => {
    setDateRange(range);
    setCustomFrom(from);
    setCustomTo(to);
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-warm-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm">
            ← Dashboard
          </Link>
          <div className="mt-8 p-6 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">Failed to load insights. Please try again.</p>
          </div>
        </div>
      </div>
    );
  }

  // Skeleton loading state
  if (insightsLoading) {
    return (
      <div className="min-h-screen bg-warm-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="mb-8">
            <div className="h-8 w-64 bg-warm-200 rounded mb-2 animate-pulse"></div>
            <div className="h-4 w-80 bg-warm-100 rounded animate-pulse"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-6">
                <div className="h-4 w-24 bg-warm-200 rounded mb-2 animate-pulse"></div>
                <div className="h-10 w-32 bg-warm-200 rounded animate-pulse"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!insights) return null;

  // Calculate max category count for bar chart scaling
  const maxCategoryCount = insights.categoryBreakdown.length > 0
    ? Math.max(...insights.categoryBreakdown.map((c) => c.count))
    : 1;

  return (
    <>
      <Head>
        <title>Insights - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 px-4 py-4">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <Link href="/organizer/dashboard" className="text-warm-400 dark:text-warm-500 hover:text-warm-600 dark:hover:text-warm-400 text-sm">
              ← Dashboard
            </Link>
            <span className="text-warm-300 dark:text-gray-700">/</span>
            <h1 className="text-lg font-semibold text-warm-900 dark:text-warm-100">Insights</h1>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
          {/* Title + Sale Filter */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100">Your Sales Analytics</h2>
              <p className="text-warm-600 dark:text-warm-400 text-sm mt-1">
                {selectedSaleId ? 'Filtered to one sale' : 'Overview of all your sales'}
              </p>
            </div>
            {insights?.salesList && insights.salesList.length > 1 && (
              <div className="flex items-center gap-2">
                <label htmlFor="sale-filter" className="text-sm font-medium text-warm-700 dark:text-warm-300 whitespace-nowrap">
                  Filter by sale:
                </label>
                <select
                  id="sale-filter"
                  value={selectedSaleId}
                  onChange={(e) => setSelectedSaleId(e.target.value)}
                  className="border border-warm-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 max-w-xs"
                >
                  <option value="">All Sales</option>
                  {insights.salesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} {s.status === 'PUBLISHED' ? '' : `(${s.status.toLowerCase()})`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Total Sales */}
            <div className="card p-6 dark:bg-gray-800 dark:border-gray-700">
              <p className="text-warm-600 dark:text-warm-400 text-xs font-semibold uppercase tracking-wide mb-2">
                Total Sales
              </p>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{insights.totalSalesCount}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">All time</p>
            </div>

            {/* Active Sales */}
            <div className="card p-6 dark:bg-gray-800 dark:border-gray-700">
              <p className="text-warm-600 dark:text-warm-400 text-xs font-semibold uppercase tracking-wide mb-2">
                Active Sales
              </p>
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-500">{insights.activeSalesCount}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">Currently live</p>
            </div>

            {/* Items Listed */}
            <div className="card p-6 dark:bg-gray-800 dark:border-gray-700">
              <p className="text-warm-600 dark:text-warm-400 text-xs font-semibold uppercase tracking-wide mb-2">
                Items Listed
              </p>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{insights.totalItems}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">All items</p>
            </div>

            {/* Items Sold */}
            <div className="card p-6 dark:bg-gray-800 dark:border-gray-700">
              <p className="text-warm-600 dark:text-warm-400 text-xs font-semibold uppercase tracking-wide mb-2">
                Items Sold
              </p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-500">{insights.totalItemsSold}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">Completed sales</p>
            </div>

            {/* Total Revenue */}
            <div className="card p-6 dark:bg-gray-800 dark:border-gray-700">
              <p className="text-warm-600 dark:text-warm-400 text-xs font-semibold uppercase tracking-wide mb-2">
                Total Revenue
              </p>
              <p className="text-3xl font-bold text-green-700 dark:text-green-500">${insights.totalRevenue.toFixed(2)}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">From sold items</p>
            </div>
          </div>

          {/* Secondary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Conversion Rate */}
            <div className="card p-6">
              <p className="text-warm-600 text-xs font-semibold uppercase tracking-wide mb-2">
                Conversion Rate
              </p>
              <p className="text-3xl font-bold text-indigo-600">{insights.conversionRate.toFixed(1)}%</p>
              <p className="text-xs text-warm-500 mt-2">
                {insights.totalItems > 0
                  ? `${insights.totalItemsSold} of ${insights.totalItems} items sold`
                  : 'No items yet'}
              </p>
            </div>

            {/* Available Items */}
            <div className="card p-6">
              <p className="text-warm-600 text-xs font-semibold uppercase tracking-wide mb-2">
                Available Items
              </p>
              <p className="text-3xl font-bold text-warm-900">{insights.totalItemsAvailable}</p>
              <p className="text-xs text-warm-500 mt-2">Not yet sold</p>
            </div>

            {/* Average Item Price */}
            <div className="card p-6">
              <p className="text-warm-600 text-xs font-semibold uppercase tracking-wide mb-2">
                Avg Item Price
              </p>
              <p className="text-3xl font-bold text-warm-900">${insights.avgItemPrice.toFixed(2)}</p>
              <p className="text-xs text-warm-500 mt-2">Average price</p>
            </div>
          </div>

          {/* Items by Category */}
          {insights.categoryBreakdown.length > 0 && (
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-warm-900 mb-6">Items by Category</h3>
              <div className="space-y-4">
                {insights.categoryBreakdown.map((cat) => {
                  const percentage = (cat.count / maxCategoryCount) * 100;
                  return (
                    <div key={cat.category}>
                      <div className="flex justify-between items-baseline mb-2">
                        <span className="text-sm font-medium text-warm-900 capitalize">
                          {cat.category}
                        </span>
                        <span className="text-xs font-semibold text-warm-600">{cat.count}</span>
                      </div>
                      {/* Pure CSS bar chart */}
                      <div className="w-full h-6 bg-warm-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full transition-all duration-300"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top Items Table */}
          {insights.topItems.length > 0 && (
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-warm-900 mb-6">Top Items (by price)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-warm-200">
                      <th className="text-left py-3 px-4 font-semibold text-warm-700">Title</th>
                      <th className="text-left py-3 px-4 font-semibold text-warm-700">Category</th>
                      <th className="text-left py-3 px-4 font-semibold text-warm-700">Price</th>
                      <th className="text-left py-3 px-4 font-semibold text-warm-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.topItems.map((item) => (
                      <tr key={item.id} className="border-b border-warm-100 hover:bg-warm-50">
                        <td className="py-3 px-4 text-warm-900 font-medium">{item.title}</td>
                        <td className="py-3 px-4 text-warm-600 capitalize">{item.category}</td>
                        <td className="py-3 px-4 font-semibold text-warm-900">
                          ${item.price.toFixed(2)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                              item.status === 'SOLD'
                                ? 'bg-green-100 text-green-700'
                                : item.status === 'AVAILABLE'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-warm-100 text-warm-700'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty State */}
          {insights.totalItems === 0 && (
            <div className="card p-12 text-center">
              <p className="text-warm-600 mb-4">No items listed yet.</p>
              <Link
                href="/organizer/add-items"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                Add Items
              </Link>
            </div>
          )}

          {/* Per-Sale Breakdown Section */}
          <hr className="my-12 border-warm-300" />

          <div className="space-y-8">
            <h2 className="text-2xl font-bold text-warm-900">Per-Sale Breakdown</h2>

            {/* Sale Selector & Date Range Controls */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-warm-900 mb-2">
                    Select Sale
                  </label>
                  <SaleSelector
                    onSaleChange={handleSaleChange}
                    selectedSaleId={selectedSaleId}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-warm-900 mb-2">
                    Date Range
                  </label>
                  <DateRangeSelector
                    onRangeChange={handleDateRangeChange}
                    selectedRange={dateRange}
                  />
                </div>
              </div>
            </div>

            {/* Placeholder when no sale selected */}
            {!selectedSaleId && (
              <div className="card p-12 text-center">
                <p className="text-warm-600">Select a sale above to see its breakdown</p>
              </div>
            )}

            {/* Per-sale metrics */}
            {selectedSaleId && metricsLoading && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={i} className="card p-6">
                      <div className="h-4 w-24 bg-warm-200 rounded mb-2 animate-pulse"></div>
                      <div className="h-10 w-32 bg-warm-200 rounded animate-pulse"></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedSaleId && metricsData && (
              <div className="space-y-8">
                {/* Date Range Info */}
                <div className="text-xs text-warm-600 text-center">
                  {metricsData.dateRange.label}
                  {metricsData.cacheExpiry && (
                    <span className="ml-2">
                      (Cache expires: {new Date(metricsData.cacheExpiry).toLocaleTimeString()})
                    </span>
                  )}
                </div>

                {/* Metrics Grid */}
                <MetricsGrid data={metricsData.metrics} />

                {/* Top Items Table */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-xl font-semibold text-warm-900 mb-4">Top Selling Items</h3>
                  <TopItemsTable items={metricsData.metrics.itemMetrics.topSellingItems} />
                </div>

                {/* Category Breakdown Chart */}
                {metricsData.metrics.itemMetrics.categoryBreakdown.length > 0 && (
                  <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-xl font-semibold text-warm-900 mb-4">
                      Category Breakdown
                    </h3>
                    <CategoryBreakdownChart
                      data={metricsData.metrics.itemMetrics.categoryBreakdown}
                    />
                  </div>
                )}

                {/* Hold Metrics */}
                <HoldMetricsCard data={metricsData.metrics.holdMetrics} />

                {/* Post Performance Card — #18 */}
                <PostPerformanceCard
                  saleId={selectedSaleId}
                  stats={clickStats}
                  isLoading={clickStatsLoading}
                />

                {/* Recommendations */}
                <RecommendationsPanel
                  seasonalPricingTips={metricsData.metrics.recommendations?.seasonalPricingTips ?? []}
                  actionItems={metricsData.metrics.recommendations?.actionItems ?? []}
                />

                {/* Refresh Info */}
                <div className="text-center text-xs text-warm-600 pt-4 border-t border-warm-200">
                  Last updated: {new Date(metricsData.lastUpdated).toLocaleString()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default OrganizerInsightsPage;
