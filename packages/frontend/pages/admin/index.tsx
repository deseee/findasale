import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface Stats {
  // existing
  totalUsers: number;
  totalOrganizers: number;
  totalItems: number;
  totalSales: number;
  totalRevenue: number;
  newUsersLast7d: number;
  newSalesLast7d: number;
  salesByStatus?: Record<string, number>;
  totalPurchases?: number;
  // new
  tierBreakdown?: { SIMPLE?: number; PRO?: number; TEAMS?: number };
  mrr?: number;
  mrrByTier?: { PRO?: number; TEAMS?: number };
  transactionRevenueLast30d?: number;
  transactionRevenueToday?: number;
  huntPassRevenueLast30d?: number;
  aLaCarteRevenueLast30d?: number;
  funnel?: {
    totalSignups: number;
    haveOrganizer: number;
    createdOneSale: number;
    publishedOneSale: number;
    paidTier: number;
  };
  sparklines?: {
    signups: number[];
    transactionRevenue: number[];
    newSales: number[];
  };
}

interface RecentActivity {
  recentPurchases: any[];
  recentUsers: any[];
  recentSales: any[];
}

const AdminDashboard = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<RecentActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login?redirect=/admin');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!isLoading && user && !user.roles?.includes('ADMIN')) {
      router.push('/access-denied');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [statsRes, activityRes] = await Promise.all([
          api.get('/admin/stats'),
          api.get('/admin/activity'),
        ]);
        setStats(statsRes.data);
        setActivity(activityRes.data);
      } catch (err) {
        console.error('Error fetching admin data:', err);
        setError('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    if (user?.roles?.includes('ADMIN')) {
      fetchData();
    }
  }, [user]);

  if (isLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading admin dashboard...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  const formatCurrency = (cents: number | undefined) => {
    if (cents === undefined) return '—';
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  const funnelPercent = (current: number | undefined, previous: number | undefined) => {
    if (!current || !previous || previous === 0) return '—';
    const pct = ((current / previous) * 100).toFixed(1);
    return `${pct}%`;
  };

  return (
    <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Admin Dashboard</h1>
        <p className="text-warm-600 dark:text-warm-400 mb-8">Welcome, {user.name}. Manage your platform here.</p>

        {/* Row 1: Money KPIs */}
        {stats && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-amber-600">
                <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">Today's Revenue</h3>
                <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{formatCurrency(stats.transactionRevenueToday)}</p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Transaction revenue</p>
              </div>

              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-amber-600">
                <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">MRR</h3>
                <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{formatCurrency(stats.mrr)}</p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Monthly recurring</p>
              </div>

              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-amber-600">
                <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">30d Revenue</h3>
                <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{formatCurrency(stats.transactionRevenueLast30d)}</p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Transactions last 30 days</p>
              </div>

              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-amber-600">
                <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">Hunt Pass Revenue</h3>
                <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{formatCurrency(stats.huntPassRevenueLast30d)}</p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Last 30 days</p>
              </div>
            </div>

            {/* Row 2: Platform KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-blue-500">
                <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">Total Users</h3>
                <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{stats.totalUsers}</p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">{stats.newUsersLast7d} new this week</p>
              </div>

              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-green-500">
                <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">Total Organizers</h3>
                <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{stats.totalOrganizers}</p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  {stats.tierBreakdown ? `${stats.tierBreakdown.PRO || 0} PRO · ${stats.tierBreakdown.TEAMS || 0} TEAMS` : '—'}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-purple-500">
                <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">Total Sales</h3>
                <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{stats.totalSales}</p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">
                  {stats.salesByStatus ? Object.entries(stats.salesByStatus).map(([status, count]) => `${count} ${status}`).join(' · ') : '—'}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-orange-500">
                <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">Total Items</h3>
                <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{stats.totalItems}</p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Across all sales</p>
              </div>
            </div>

            {/* Row 3: Organizer Funnel */}
            {stats.funnel && (
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-8 border-l-4 border-indigo-500">
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-6">Organizer Funnel</h3>
                <div className="flex flex-col md:flex-row items-stretch gap-4">
                  <div className="flex-1 bg-indigo-50 dark:bg-indigo-900/20 rounded p-4 border border-indigo-200 dark:border-indigo-800">
                    <p className="text-xs uppercase text-indigo-600 dark:text-indigo-400 font-medium">Sign-ups</p>
                    <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100 mt-2">{stats.funnel.totalSignups}</p>
                  </div>

                  <div className="flex items-center justify-center text-indigo-400">→</div>

                  <div className="flex-1 bg-indigo-50 dark:bg-indigo-900/20 rounded p-4 border border-indigo-200 dark:border-indigo-800">
                    <p className="text-xs uppercase text-indigo-600 dark:text-indigo-400 font-medium">Have Organizer</p>
                    <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100 mt-2">{stats.funnel.haveOrganizer}</p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">{funnelPercent(stats.funnel.haveOrganizer, stats.funnel.totalSignups)} of signups</p>
                  </div>

                  <div className="flex items-center justify-center text-indigo-400">→</div>

                  <div className="flex-1 bg-indigo-50 dark:bg-indigo-900/20 rounded p-4 border border-indigo-200 dark:border-indigo-800">
                    <p className="text-xs uppercase text-indigo-600 dark:text-indigo-400 font-medium">Created Sale</p>
                    <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100 mt-2">{stats.funnel.createdOneSale}</p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">{funnelPercent(stats.funnel.createdOneSale, stats.funnel.haveOrganizer)} of organizers</p>
                  </div>

                  <div className="flex items-center justify-center text-indigo-400">→</div>

                  <div className="flex-1 bg-indigo-50 dark:bg-indigo-900/20 rounded p-4 border border-indigo-200 dark:border-indigo-800">
                    <p className="text-xs uppercase text-indigo-600 dark:text-indigo-400 font-medium">Published Sale</p>
                    <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100 mt-2">{stats.funnel.publishedOneSale}</p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">{funnelPercent(stats.funnel.publishedOneSale, stats.funnel.createdOneSale)} of created</p>
                  </div>

                  <div className="flex items-center justify-center text-indigo-400">→</div>

                  <div className="flex-1 bg-indigo-50 dark:bg-indigo-900/20 rounded p-4 border border-indigo-200 dark:border-indigo-800">
                    <p className="text-xs uppercase text-indigo-600 dark:text-indigo-400 font-medium">Paid Tier</p>
                    <p className="text-2xl font-bold text-indigo-900 dark:text-indigo-100 mt-2">{stats.funnel.paidTier}</p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">{funnelPercent(stats.funnel.paidTier, stats.funnel.publishedOneSale)} converted</p>
                  </div>
                </div>
              </div>
            )}

            {/* Row 4: Sparkline Trends */}
            {stats.sparklines && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-cyan-500">
                  <h3 className="text-sm font-medium uppercase text-warm-600 dark:text-warm-400 mb-4">New Signups (7d)</h3>
                  <div className="flex items-end gap-1 h-16 mb-4">
                    {stats.sparklines.signups.length > 0 ? (
                      stats.sparklines.signups.map((value, idx) => {
                        const maxVal = Math.max(...stats.sparklines.signups, 1);
                        const heightPercent = (value / maxVal) * 100;
                        return (
                          <div
                            key={idx}
                            className="flex-1 bg-cyan-400 dark:bg-cyan-500 rounded-t"
                            style={{ height: `${heightPercent}%`, minHeight: '4px' }}
                            title={`Day ${idx + 1}: ${value}`}
                          />
                        );
                      })
                    ) : null}
                  </div>
                  <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{stats.sparklines.signups.reduce((a, b) => a + b, 0)}</p>
                  <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Total this week</p>
                </div>

                <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-green-500">
                  <h3 className="text-sm font-medium uppercase text-warm-600 dark:text-warm-400 mb-4">Daily Revenue (7d)</h3>
                  <div className="flex items-end gap-1 h-16 mb-4">
                    {stats.sparklines.transactionRevenue.length > 0 ? (
                      stats.sparklines.transactionRevenue.map((value, idx) => {
                        const maxVal = Math.max(...stats.sparklines.transactionRevenue, 1);
                        const heightPercent = (value / maxVal) * 100;
                        return (
                          <div
                            key={idx}
                            className="flex-1 bg-green-400 dark:bg-green-500 rounded-t"
                            style={{ height: `${heightPercent}%`, minHeight: '4px' }}
                            title={`Day ${idx + 1}: ${formatCurrency(value)}`}
                          />
                        );
                      })
                    ) : null}
                  </div>
                  <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{formatCurrency(stats.sparklines.transactionRevenue.reduce((a, b) => a + b, 0))}</p>
                  <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Total this week</p>
                </div>

                <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-pink-500">
                  <h3 className="text-sm font-medium uppercase text-warm-600 dark:text-warm-400 mb-4">New Sales (7d)</h3>
                  <div className="flex items-end gap-1 h-16 mb-4">
                    {stats.sparklines.newSales.length > 0 ? (
                      stats.sparklines.newSales.map((value, idx) => {
                        const maxVal = Math.max(...stats.sparklines.newSales, 1);
                        const heightPercent = (value / maxVal) * 100;
                        return (
                          <div
                            key={idx}
                            className="flex-1 bg-pink-400 dark:bg-pink-500 rounded-t"
                            style={{ height: `${heightPercent}%`, minHeight: '4px' }}
                            title={`Day ${idx + 1}: ${value}`}
                          />
                        );
                      })
                    ) : null}
                  </div>
                  <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{stats.sparklines.newSales.reduce((a, b) => a + b, 0)}</p>
                  <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Total this week</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Link href="/admin/users" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 transition">
            <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Manage Users</h3>
            <p className="text-warm-600 dark:text-warm-400 text-sm">View and manage all users, update roles</p>
          </Link>

          <Link href="/admin/sales" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 transition">
            <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Manage Sales</h3>
            <p className="text-warm-600 dark:text-warm-400 text-sm">View and delete sales, monitor activity</p>
          </Link>

          <Link href="/admin/bid-review" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-red-50 dark:bg-red-900/20 border border-red-100 transition">
            <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Bid Review</h3>
            <p className="text-warm-600 dark:text-warm-400 text-sm">Monitor bid IP records for fraud</p>
          </Link>

          <Link href="/admin/invites" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-amber-50 dark:bg-amber-900/20 border border-amber-100 transition">
            <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Beta Invites</h3>
            <p className="text-warm-600 dark:text-warm-400 text-sm">Generate and manage organizer invite codes</p>
          </Link>

          <Link href="/creator/dashboard" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-purple-50 dark:bg-purple-900/20 border border-purple-100 transition">
            <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Creator Program</h3>
            <p className="text-warm-600 dark:text-warm-400 text-sm">View creator/affiliate dashboard and analytics</p>
          </Link>
        </div>

        {/* Recent Activity */}
        {activity && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Purchases */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-4">Recent Purchases</h3>
              <div className="space-y-3">
                {activity.recentPurchases.length > 0 ? (
                  activity.recentPurchases.slice(0, 5).map(purchase => (
                    <div key={purchase.id} className="border-b border-warm-200 dark:border-gray-700 pb-3 last:border-0 text-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-warm-900 dark:text-warm-100">{purchase.user.name}</p>
                          <p className="text-warm-600 dark:text-warm-400">{purchase.item?.title || 'Item'}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-warm-900 dark:text-warm-100">${(purchase.amount / 100).toFixed(2)}</p>
                          <p className={`text-xs ${purchase.status === 'PAID' ? 'text-green-600' : 'text-yellow-600'}`}>
                            {purchase.status}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">{new Date(purchase.createdAt).toLocaleDateString()}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-warm-500 dark:text-warm-400">No recent purchases</p>
                )}
              </div>
            </div>

            {/* Recent Users */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-4">New Sign-ups</h3>
              <div className="space-y-3">
                {activity.recentUsers.length > 0 ? (
                  activity.recentUsers.slice(0, 5).map(newUser => (
                    <div key={newUser.id} className="border-b border-warm-200 dark:border-gray-700 pb-3 last:border-0 text-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-warm-900 dark:text-warm-100">{newUser.name}</p>
                          <p className="text-warm-600 dark:text-warm-400 text-xs">{newUser.email}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${
                          newUser.role === 'ADMIN' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                          newUser.role === 'ORGANIZER' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                          'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}>
                          {newUser.role}
                        </span>
                      </div>
                      <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">{new Date(newUser.createdAt).toLocaleDateString()}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-warm-500 dark:text-warm-400">No recent users</p>
                )}
              </div>
            </div>

            {/* Recent Sales */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 lg:col-span-2">
              <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-4">Recent Sales</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-warm-200 dark:border-gray-700">
                      <th className="text-left px-4 py-2 font-medium text-warm-900 dark:text-warm-100">Sale Title</th>
                      <th className="text-left px-4 py-2 font-medium text-warm-900 dark:text-warm-100">Organizer</th>
                      <th className="text-center px-4 py-2 font-medium text-warm-900 dark:text-warm-100">Status</th>
                      <th className="text-right px-4 py-2 font-medium text-warm-900 dark:text-warm-100">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.recentSales.length > 0 ? (
                      activity.recentSales.slice(0, 5).map(sale => (
                        <tr key={sale.id} className="border-b border-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900">
                          <td className="px-4 py-2 text-warm-900 dark:text-warm-100">{sale.title}</td>
                          <td className="px-4 py-2 text-warm-600 dark:text-warm-400">{sale.organizer.businessName}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`text-xs px-2 py-1 rounded ${
                              sale.status === 'PUBLISHED' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                              sale.status === 'ENDED' ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' :
                              'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                            }`}>
                              {sale.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right text-warm-500 dark:text-warm-400">{new Date(sale.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-warm-500 dark:text-warm-400">No recent sales</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};

export default AdminDashboard;
