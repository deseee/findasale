/**
 * MetricsGrid Component
 * 8 metric cards in responsive grid with Recharts visualizations
 */

import React from 'react';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

interface MetricsData {
  revenue: {
    total: number;
    currency: string;
    organiserNetRevenue: number;
    sourceCounts: {
      online: number;
      pos: number;
    };
  };
  itemMetrics: {
    topSellingItems: any[];
    categoryBreakdown: any[];
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
}

interface MetricsGridProps {
  data: MetricsData;
}

const MetricsGrid: React.FC<MetricsGridProps> = ({ data }) => {
  if (!data) {
    return (
      <div className="text-center py-12 text-warm-600">
        No sales data available
      </div>
    );
  }

  // Prepare pie chart data for sell-through rate
  const totalItems =
    data.itemMetrics.categoryBreakdown.reduce((sum, cat) => sum + cat.itemsListed, 0) || 1;
  const soldItems =
    data.itemMetrics.categoryBreakdown.reduce((sum, cat) => sum + cat.itemsSold, 0) || 0;
  const unsoldItems = totalItems - soldItems;

  const sellThroughData = [
    { name: 'Sold', value: soldItems },
    { name: 'Unsold', value: unsoldItems },
  ];

  // Prepare source breakdown pie data
  const sourceData = [
    { name: 'Online', value: data.revenue.sourceCounts.online },
    { name: 'POS', value: data.revenue.sourceCounts.pos },
  ];

  const COLORS = ['#d97706', '#f59e0b'];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Revenue Card */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-600">
        <p className="text-warm-600 text-sm font-semibold uppercase mb-2">Total Revenue</p>
        <p className="text-3xl font-bold text-warm-900 mb-3">${data.revenue.total.toFixed(2)}</p>
        <p className="text-xs text-warm-600 mb-3">
          Net: ${data.revenue.organiserNetRevenue.toFixed(2)}
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-warm-600">Online</p>
            <p className="font-bold text-warm-900">{data.revenue.sourceCounts.online}</p>
          </div>
          <div>
            <p className="text-warm-600">POS</p>
            <p className="font-bold text-warm-900">{data.revenue.sourceCounts.pos}</p>
          </div>
        </div>
      </div>

      {/* Conversion Rate Card */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-600">
        <p className="text-warm-600 text-sm font-semibold uppercase mb-2">Conversion Rate</p>
        <p className="text-3xl font-bold text-warm-900 mb-3">
          {(data.purchasingMetrics.conversionRate * 100).toFixed(1)}%
        </p>
        <p className="text-xs text-warm-600 mb-2">
          {Math.round(data.purchasingMetrics.conversionRate * 100)}% of favorited items purchased
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-warm-600">Buyers</p>
            <p className="font-bold text-warm-900">{data.purchasingMetrics.totalUniqueBuyers}</p>
          </div>
          <div>
            <p className="text-warm-600">Avg Cart</p>
            <p className="font-bold text-warm-900">
              ${data.purchasingMetrics.averageCartValue.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Health Score Card */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-600">
        <p className="text-warm-600 text-sm font-semibold uppercase mb-2">Avg Health Score</p>
        <p className="text-3xl font-bold text-warm-900 mb-3">
          {data.itemMetrics.aggregateHealthScore.toFixed(0)}
        </p>
        <div className="w-full bg-warm-200 rounded-full h-2 mb-2">
          <div
            className={`h-2 rounded-full ${
              data.itemMetrics.aggregateHealthScore >= 80
                ? 'bg-green-600'
                : data.itemMetrics.aggregateHealthScore >= 60
                ? 'bg-amber-600'
                : 'bg-red-600'
            }`}
            style={{
              width: `${Math.min(data.itemMetrics.aggregateHealthScore, 100)}%`,
            }}
          />
        </div>
        <p className="text-xs text-warm-600">
          {data.itemMetrics.aggregateHealthScore >= 80
            ? '✓ Excellent item quality'
            : data.itemMetrics.aggregateHealthScore >= 60
            ? '⚠️ Room for improvement'
            : '⚠️ Need better photos/descriptions'}
        </p>
      </div>

      {/* Sell-Through Rate Card */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-amber-600">
        <p className="text-warm-600 text-sm font-semibold uppercase mb-2">Sell-Through Rate</p>
        <p className="text-3xl font-bold text-warm-900 mb-3">
          {totalItems > 0 ? ((soldItems / totalItems) * 100).toFixed(0) : 0}%
        </p>
        <p className="text-xs text-warm-600 mb-3">
          {soldItems} of {totalItems} items sold
        </p>
        {totalItems > 0 && (
          <ResponsiveContainer width="100%" height={60}>
            <PieChart>
              <Pie
                data={sellThroughData}
                cx="50%"
                cy="50%"
                innerRadius={15}
                outerRadius={25}
                dataKey="value"
              >
                <Cell fill="#10b981" />
                <Cell fill="#d1d5db" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Total Items Card */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-indigo-600">
        <p className="text-warm-600 text-sm font-semibold uppercase mb-2">Total Items Listed</p>
        <p className="text-3xl font-bold text-warm-900 mb-3">{totalItems}</p>
        <p className="text-xs text-warm-600 mb-3">
          {soldItems} sold, {unsoldItems} remaining
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-warm-600">Categories</p>
            <p className="font-bold text-warm-900">
              {data.itemMetrics.categoryBreakdown.length}
            </p>
          </div>
          <div>
            <p className="text-warm-600">Top Item</p>
            <p className="font-bold text-warm-900">
              {data.itemMetrics.topSellingItems.length > 0
                ? data.itemMetrics.topSellingItems[0].unitsSold
                : 0}{' '}
              units
            </p>
          </div>
        </div>
      </div>

      {/* Top-Selling Item Card */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-pink-600">
        <p className="text-warm-600 text-sm font-semibold uppercase mb-2">Top Item</p>
        {data.itemMetrics.topSellingItems.length > 0 ? (
          <>
            <p className="text-lg font-bold text-warm-900 mb-2 truncate">
              {data.itemMetrics.topSellingItems[0].title}
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-warm-600">Units Sold</p>
                <p className="font-bold text-warm-900">
                  {data.itemMetrics.topSellingItems[0].unitsSold}
                </p>
              </div>
              <div>
                <p className="text-warm-600">Revenue</p>
                <p className="font-bold text-warm-900">
                  ${data.itemMetrics.topSellingItems[0].totalRevenue.toFixed(2)}
                </p>
              </div>
            </div>
            <p className="text-xs text-warm-600 mt-2">
              Category: {data.itemMetrics.topSellingItems[0].category}
            </p>
          </>
        ) : (
          <p className="text-xs text-warm-600">No items sold yet</p>
        )}
      </div>

      {/* Hold Conversion Card */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-orange-600">
        <p className="text-warm-600 text-sm font-semibold uppercase mb-2">Hold Conversion</p>
        <p className="text-3xl font-bold text-warm-900 mb-3">
          {data.holdMetrics.holdsCreated > 0
            ? ((data.holdMetrics.holdsConverted / data.holdMetrics.holdsCreated) * 100).toFixed(0)
            : 0}
          %
        </p>
        <p className="text-xs text-warm-600 mb-3">
          {data.holdMetrics.holdsConverted} of {data.holdMetrics.holdsCreated} holds converted
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-warm-600">Expired</p>
            <p className="font-bold text-warm-900">{data.holdMetrics.holdsExpired}</p>
          </div>
          <div>
            <p className="text-warm-600">Cancelled</p>
            <p className="font-bold text-warm-900">{data.holdMetrics.holdsCancelled}</p>
          </div>
        </div>
      </div>

      {/* No-Show Rate Card */}
      <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-600">
        <p className="text-warm-600 text-sm font-semibold uppercase mb-2">No-Show Rate</p>
        <p className="text-3xl font-bold text-red-600 mb-3">
          {(data.holdMetrics.noShowRate * 100).toFixed(1)}%
        </p>
        <p className="text-xs text-warm-600 mb-3">
          {data.holdMetrics.noShowRate > 0.25
            ? '⚠️ Above 25% threshold'
            : '✓ Healthy rate'}
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-warm-600">Repeat Buyers</p>
            <p className="font-bold text-warm-900">
              {(data.purchasingMetrics.repeatBuyerRate * 100).toFixed(0)}%
            </p>
          </div>
          <div>
            <p className="text-warm-600">Avg Price</p>
            <p className="font-bold text-warm-900">
              ${data.revenue.sourceCounts.online > 0 ? (data.revenue.total / (data.revenue.sourceCounts.online + data.revenue.sourceCounts.pos)).toFixed(2) : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsGrid;
