/**
 * Per-Sale Analytics Page
 *
 * Detailed analytics for a single estate sale:
 * - Items sold vs available vs on hold (donut chart)
 * - Revenue timeline (line chart)
 * - Top items by favorites
 * - Shopper engagement metrics
 * - Pickup appointment schedule
 */

import React from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import Head from 'next/head';
import Link from 'next/link';
import { PieChart, Pie, Cell, Legend, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';

interface PerSaleAnalytics {
  saleId: string;
  saleName: string;
  itemsSold: number;
  itemsAvailable: number;
  itemsOnHold: number;
  totalItems: number;
  totalRevenue: number;
  purchaseCount: number;
  topItems: Array<{
    id: string;
    title: string;
    price: number;
    status: string;
    favoriteCount: number;
  }>;
  uniqueVisitors: number;
  wishlistCount: number;
  waitlistCount: number;
  pickupAppointments: Array<{
    startsAt: string;
    endsAt: string;
    capacity: number;
    booked: number;
  }>;
  revenueTimeline: Array<{
    date: string;
    revenue: number;
  }>;
}

const PerSaleAnalyticsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { id: saleId } = router.query;
  const [isClient, setIsClient] = React.useState(false);

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  // Redirect if not authenticated or not an organizer
  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  // Fetch per-sale analytics
  const { data: analytics, isLoading: analyticsLoading, error } = useQuery({
    queryKey: ['sale-analytics', saleId],
    queryFn: async () => {
      const response = await api.get(`/insights/organizer/sale/${saleId}`);
      return response.data as PerSaleAnalytics;
    },
    enabled: !!saleId && typeof saleId === 'string',
  });

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Link href="/organizer/dashboard" className="text-amber-600 hover:underline text-sm">
            ← Dashboard
          </Link>
          <div className="mt-8 p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-700 dark:text-red-300">Failed to load sale analytics. Please try again.</p>
          </div>
        </div>
      </div>
    );
  }

  // Skeleton loading state
  if (analyticsLoading) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="mb-8">
            <div className="h-8 w-64 bg-warm-200 rounded mb-2 animate-pulse"></div>
            <div className="h-4 w-80 bg-warm-100 dark:bg-gray-700 rounded animate-pulse"></div>
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

  if (!analytics) return null;

  const CHART_COLORS = {
    amber: '#d97706',
    sage: '#5c7a5c',
    slate: '#6b7280',
  };

  // Prepare item status data for donut chart
  const itemStatusData = [
    { name: 'Sold', value: analytics.itemsSold, color: '#10b981' },
    { name: 'Available', value: analytics.itemsAvailable, color: '#3b82f6' },
    { name: 'On Hold', value: analytics.itemsOnHold, color: '#f59e0b' },
  ].filter(d => d.value > 0);

  // Calculate conversion rate
  const conversionRate = analytics.totalItems > 0
    ? ((analytics.itemsSold / analytics.totalItems) * 100).toFixed(1)
    : '0.0';

  return (
    <>
      <Head>
        <title>{analytics.saleName} - Analytics - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 px-4 py-4">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <Link href="/organizer/dashboard" className="text-warm-400 hover:text-warm-600 dark:text-warm-400 text-sm">
              ← Dashboard
            </Link>
            <span className="text-warm-300">/</span>
            <Link href="/organizer/insights" className="text-warm-400 hover:text-warm-600 dark:text-warm-400 text-sm">
              Insights
            </Link>
            <span className="text-warm-300">/</span>
            <h1 className="text-lg font-semibold text-warm-900 dark:text-warm-100">{analytics.saleName}</h1>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
          {/* Title */}
          <div>
            <h2 className="text-2xl font-bold text-warm-900 dark:text-warm-100">Sale Analytics</h2>
            <p className="text-warm-600 dark:text-warm-400 text-sm mt-1">
              Performance metrics and shopper engagement for {analytics.saleName}
            </p>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-6">
              <p className="text-warm-600 dark:text-warm-400 text-xs font-semibold uppercase tracking-wide mb-2">
                Items Sold
              </p>
              <p className="text-3xl font-bold text-green-600">{analytics.itemsSold}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">of {analytics.totalItems} items</p>
            </div>

            <div className="card p-6">
              <p className="text-warm-600 dark:text-warm-400 text-xs font-semibold uppercase tracking-wide mb-2">
                Conversion Rate
              </p>
              <p className="text-3xl font-bold text-indigo-600">{conversionRate}%</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">Items sold ratio</p>
            </div>

            <div className="card p-6">
              <p className="text-warm-600 dark:text-warm-400 text-xs font-semibold uppercase tracking-wide mb-2">
                Total Revenue
              </p>
              <p className="text-3xl font-bold text-green-700">${analytics.totalRevenue.toFixed(2)}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">{analytics.purchaseCount} purchases</p>
            </div>

            <div className="card p-6">
              <p className="text-warm-600 dark:text-warm-400 text-xs font-semibold uppercase tracking-wide mb-2">
                Shopper Interest
              </p>
              <p className="text-3xl font-bold text-amber-600">{analytics.wishlistCount}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">Wishlist adds</p>
            </div>
          </div>

          {/* Secondary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-6">
              <p className="text-warm-600 dark:text-warm-400 text-xs font-semibold uppercase tracking-wide mb-2">
                Unique Visitors
              </p>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{analytics.uniqueVisitors}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">Subscribers</p>
            </div>

            <div className="card p-6">
              <p className="text-warm-600 dark:text-warm-400 text-xs font-semibold uppercase tracking-wide mb-2">
                Available Items
              </p>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100">{analytics.itemsAvailable}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">Not yet sold</p>
            </div>

            <div className="card p-6">
              <p className="text-warm-600 dark:text-warm-400 text-xs font-semibold uppercase tracking-wide mb-2">
                On Hold
              </p>
              <p className="text-3xl font-bold text-amber-600">{analytics.itemsOnHold}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-2">Reserved items</p>
            </div>
          </div>

          {/* Item Status Donut Chart & Revenue Timeline */}
          {isClient && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Item Status Donut */}
              {itemStatusData.length > 0 && (
                <div className="card p-6">
                  <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-6">Item Status Distribution</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={itemStatusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        label={({ name, value }: { name: string; value: number }) => `${name}: ${value}`}
                      >
                        {itemStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number | string) => `${value} items`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Revenue Timeline */}
              {isClient && analytics.revenueTimeline && analytics.revenueTimeline.length > 0 && (
                <div className="card p-6">
                  <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-6">Revenue Timeline</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analytics.revenueTimeline}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        stroke="#6b7280"
                      />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        stroke="#6b7280"
                        label={{ value: 'Revenue ($)', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip
                        formatter={(value: number | string) => `$${Number(value).toFixed(2)}`}
                        contentStyle={{ backgroundColor: '#fff', border: `1px solid ${CHART_COLORS.slate}` }}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke={CHART_COLORS.amber}
                        strokeWidth={2}
                        dot={{ fill: CHART_COLORS.amber, r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Top Items by Favorites */}
          {analytics.topItems.length > 0 && (
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-6">Top Items (by favorites)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-warm-200 dark:border-gray-700">
                      <th className="text-left py-3 px-4 font-semibold text-warm-700 dark:text-warm-300">Title</th>
                      <th className="text-left py-3 px-4 font-semibold text-warm-700 dark:text-warm-300">Price</th>
                      <th className="text-left py-3 px-4 font-semibold text-warm-700 dark:text-warm-300">Status</th>
                      <th className="text-left py-3 px-4 font-semibold text-warm-700 dark:text-warm-300">Favorites</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topItems.map((item) => (
                      <tr key={item.id} className="border-b border-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900">
                        <td className="py-3 px-4 text-warm-900 dark:text-warm-100 font-medium">{item.title}</td>
                        <td className="py-3 px-4 font-semibold text-warm-900 dark:text-warm-100">
                          ${item.price.toFixed(2)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                              item.status === 'SOLD'
                                ? 'bg-green-100 text-green-700'
                                : item.status === 'AVAILABLE'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-warm-600 dark:text-warm-400">{item.favoriteCount} ❤️</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pickup Appointments */}
          {analytics.pickupAppointments.length > 0 && (
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-6">Pickup Appointment Schedule</h3>
              <div className="space-y-4">
                {analytics.pickupAppointments.map((slot, idx) => {
                  const startDate = new Date(slot.startsAt).toLocaleDateString();
                  const startTime = new Date(slot.startsAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const endTime = new Date(slot.endsAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const availableSpots = Math.max(0, slot.capacity - slot.booked);

                  return (
                    <div key={idx} className="border border-warm-200 dark:border-gray-700 rounded-lg p-4 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-warm-900 dark:text-warm-100">
                            {startDate} • {startTime} - {endTime}
                          </p>
                          <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">
                            {slot.booked} of {slot.capacity} slots booked
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-sm font-semibold ${
                              availableSpots > 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {availableSpots} available
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Shopper Engagement Summary */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">Shopper Engagement</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-warm-600 dark:text-warm-400 mb-1">Unique Visitors</p>
                <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{analytics.uniqueVisitors}</p>
              </div>
              <div>
                <p className="text-sm text-warm-600 dark:text-warm-400 mb-1">Wishlist Adds</p>
                <p className="text-2xl font-bold text-amber-600">{analytics.wishlistCount}</p>
              </div>
              <div>
                <p className="text-sm text-warm-600 dark:text-warm-400 mb-1">Waitlist Entries</p>
                <p className="text-2xl font-bold text-indigo-600">{analytics.waitlistCount}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PerSaleAnalyticsPage;
