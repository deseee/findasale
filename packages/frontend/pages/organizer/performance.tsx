/**
 * Seller Performance Dashboard
 * Route: /organizer/performance
 *
 * Main page for organizers to track sale performance
 * - Sale selector dropdown
 * - Date range selector (quick picks + custom)
 * - Metrics grid with 8 KPI cards
 * - Top items table (sortable)
 * - Category breakdown chart
 * - Hold metrics card
 * - Recommendations panel (seasonal pricing + action items)
 */

import React, { useState, useEffect } from 'react';
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
import Skeleton from '../../components/Skeleton';

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

const PerformanceDashboard = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<string>('30d');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  // Redirect if not authenticated or not an organizer
  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  // Fetch performance metrics
  const { data: metricsData, isLoading, error, refetch } = useQuery({
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
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch organizer's sales to pre-select first sale
  const { data: sales = [] } = useQuery({
    queryKey: ['organizer-sales-perf'],
    queryFn: async () => {
      const response = await api.get('/sales/mine');
      return (response.data?.sales || []) as Array<{ id: string; title: string }>;
    },
    enabled: !!user?.id,
  });

  // Auto-select first sale on load
  useEffect(() => {
    if (sales.length > 0 && !selectedSaleId) {
      setSelectedSaleId(sales[0].id);
    }
  }, [sales, selectedSaleId]);

  const handleSaleChange = (saleId: string) => {
    setSelectedSaleId(saleId);
  };

  const handleDateRangeChange = (range: string, from?: Date, to?: Date) => {
    setDateRange(range);
    setCustomFrom(from);
    setCustomTo(to);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <Skeleton className="h-10 w-48 mb-8" />
          <Skeleton className="h-12 w-full mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Performance Dashboard - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-warm-900 mb-2">Performance Dashboard</h1>
            <p className="text-warm-600">
              Track your sale performance and get actionable insights
            </p>
          </div>

          {/* Navigation */}
          <div className="flex gap-4 mb-8">
            <Link
              href="/organizer/dashboard"
              className="text-warm-600 hover:text-warm-900 font-medium"
            >
              ← Back to Dashboard
            </Link>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
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

          {/* Error State */}
          {error && (
            <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              <p className="font-semibold">Error loading metrics</p>
              <p className="text-sm mt-1">
                {error instanceof Error ? error.message : 'Failed to load performance data'}
              </p>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
              <Skeleton className="h-96" />
            </div>
          )}

          {/* Content */}
          {!isLoading && metricsData && (
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
                <h2 className="text-xl font-semibold text-warm-900 mb-4">Top Selling Items</h2>
                <TopItemsTable items={metricsData.metrics.itemMetrics.topSellingItems} />
              </div>

              {/* Category Breakdown Chart */}
              {metricsData.metrics.itemMetrics.categoryBreakdown.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-xl font-semibold text-warm-900 mb-4">
                    Category Breakdown
                  </h2>
                  <CategoryBreakdownChart
                    data={metricsData.metrics.itemMetrics.categoryBreakdown}
                  />
                </div>
              )}

              {/* Hold Metrics */}
              <HoldMetricsCard data={metricsData.metrics.holdMetrics} />

              {/* Recommendations */}
              <RecommendationsPanel
                seasonalPricingTips={metricsData.metrics.recommendations.seasonalPricingTips}
                actionItems={metricsData.metrics.recommendations.actionItems}
              />

              {/* Refresh Info */}
              <div className="text-center text-xs text-warm-600 pt-4 border-t border-warm-200">
                Last updated: {new Date(metricsData.lastUpdated).toLocaleString()}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !metricsData && !selectedSaleId && (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-warm-600">Select a sale to view performance metrics</p>
            </div>
          )}

          {/* No Sales State */}
          {!isLoading && sales.length === 0 && (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <p className="text-warm-600 mb-4">You haven't created any sales yet</p>
              <Link
                href="/organizer/create-sale"
                className="text-amber-600 hover:underline font-semibold"
              >
                Create your first sale
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PerformanceDashboard;
