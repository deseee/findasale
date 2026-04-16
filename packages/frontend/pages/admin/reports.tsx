import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface OrganizerRecord {
  id: string;
  businessName: string;
  tier: string;
  salesCount: number;
  itemsCount: number;
  soldItemsCount: number;
  sellThroughRate: number;
  totalGmv: number;
  platformRevenue: number;
  lastSaleAt: string | null;
  joinedAt: string;
}

interface OrganizerResponse {
  organizers: OrganizerRecord[];
  total: number;
  page: number;
}

interface RevenueData {
  period: string;
  transactionRevenue: number;
  subscriptionRevenue: number;
  total: number;
  byDay: Array<{
    date: string;
    transactionRevenue: number;
    newOrganizers: number;
  }>;
}

const AdminReportsPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'organizers' | 'revenue'>('organizers');

  // Organizers tab state
  const [organizers, setOrganizers] = useState<OrganizerRecord[]>([]);
  const [organizersTotal, setOrganizersTotal] = useState(0);
  const [organizersPage, setOrganizersPage] = useState(1);
  const [organizersSortBy, setOrganizersSortBy] = useState('revenue');
  const [organizersOrder, setOrganizersOrder] = useState<'asc' | 'desc'>('desc');
  const [organizersLoading, setOrganizersLoading] = useState(true);
  const [organizersError, setOrganizersError] = useState('');

  // Revenue tab state
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [revenuePeriod, setRevenuePeriod] = useState('30d');
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [revenueError, setRevenueError] = useState('');

  // Auth guard
  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // Fetch organizers
  const fetchOrganizers = async (page = 1) => {
    try {
      setOrganizersLoading(true);
      setOrganizersError('');
      const res = await api.get(`/admin/reports/organizers`, {
        params: {
          page,
          sortBy: organizersSortBy,
          order: organizersOrder,
        },
      });
      setOrganizers(res.data.organizers);
      setOrganizersTotal(res.data.total);
      setOrganizersPage(page);
    } catch (err) {
      console.error('Error fetching organizers:', err);
      setOrganizersError('Failed to load organizer data');
    } finally {
      setOrganizersLoading(false);
    }
  };

  // Fetch revenue
  const fetchRevenue = async () => {
    try {
      setRevenueLoading(true);
      setRevenueError('');
      const res = await api.get(`/admin/reports/revenue`, {
        params: { period: revenuePeriod },
      });
      setRevenue(res.data);
    } catch (err) {
      console.error('Error fetching revenue:', err);
      setRevenueError('Failed to load revenue data');
    } finally {
      setRevenueLoading(false);
    }
  };

  // Initial loads
  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchOrganizers(1);
    }
  }, [user, organizersSortBy, organizersOrder]);

  useEffect(() => {
    if (user?.roles?.includes('ADMIN') && activeTab === 'revenue') {
      fetchRevenue();
    }
  }, [user, activeTab, revenuePeriod]);

  const formatCurrency = (cents: number) => {
    if (cents === undefined || cents === null) return '—';
    return (cents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
    });
  };

  const getTierBadgeColors = (tier: string) => {
    switch (tier) {
      case 'SIMPLE':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
      case 'PRO':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
      case 'TEAMS':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  };

  const getSellThroughColor = (rate: number) => {
    if (rate >= 0.5) return 'text-green-600 dark:text-green-400';
    if (rate >= 0.2) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const exportCSV = () => {
    if (organizers.length === 0) return;

    const headers = [
      'Business Name',
      'Tier',
      'Sales',
      'Items',
      'Sold',
      'Sell-Through %',
      'GMV',
      'Platform Revenue',
      'Last Sale',
      'Joined',
    ];

    const rows = organizers.map((org) => [
      org.businessName,
      org.tier,
      org.salesCount,
      org.itemsCount,
      org.soldItemsCount,
      (org.sellThroughRate * 100).toFixed(1),
      formatCurrency(org.totalGmv),
      formatCurrency(org.platformRevenue),
      org.lastSaleAt ? new Date(org.lastSaleAt).toLocaleDateString() : '—',
      new Date(org.joinedAt).toLocaleDateString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row
          .map((cell) => {
            const str = String(cell);
            return str.includes(',') ? `"${str}"` : str;
          })
          .join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `organizers-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">
          Loading...
        </div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  const totalPages = Math.ceil(organizersTotal / 20);
  const maxDailyRevenue =
    revenue?.byDay?.length ? Math.max(...revenue.byDay.map((d) => d.transactionRevenue)) : 1;

  return (
    <>
      <Head>
        <title>Reports - FindA.Sale Admin</title>
        <meta name="description" content="Platform analytics and reports" />
      </Head>

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">
            Reports
          </h1>
          <p className="text-warm-600 dark:text-warm-400">
            Platform analytics and organizer performance
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-4 mb-6 border-b border-warm-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('organizers')}
            className={`px-4 py-3 font-medium text-sm transition border-b-2 ${
              activeTab === 'organizers'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100'
            }`}
          >
            Organizer Performance
          </button>
          <button
            onClick={() => setActiveTab('revenue')}
            className={`px-4 py-3 font-medium text-sm transition border-b-2 ${
              activeTab === 'revenue'
                ? 'border-amber-600 text-amber-600 dark:text-amber-400'
                : 'border-transparent text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100'
            }`}
          >
            Revenue
          </button>
        </div>

        {/* Organizers Tab */}
        {activeTab === 'organizers' && (
          <div>
            {organizersError && (
              <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
                {organizersError}
              </div>
            )}

            {/* Organizers Controls */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex flex-col md:flex-row gap-4 flex-1">
                  <select
                    value={organizersSortBy}
                    onChange={(e) => setOrganizersSortBy(e.target.value)}
                    className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
                  >
                    <option value="revenue">Sort by Revenue</option>
                    <option value="sellThrough">Sort by Sell-Through</option>
                    <option value="salesCount">Sort by Sales Count</option>
                    <option value="lastActive">Sort by Last Active</option>
                  </select>

                  <select
                    value={organizersOrder}
                    onChange={(e) =>
                      setOrganizersOrder(e.target.value as 'asc' | 'desc')
                    }
                    className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
                  >
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
                  </select>
                </div>

                <button
                  onClick={exportCSV}
                  disabled={organizers.length === 0}
                  className="px-6 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition disabled:bg-warm-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                  Export CSV
                </button>
              </div>
            </div>

            {/* Organizers Table */}
            {organizersLoading ? (
              <div className="text-center py-8 text-warm-600 dark:text-warm-400">
                Loading organizers...
              </div>
            ) : (
              <>
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">
                            Business Name
                          </th>
                          <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">
                            Tier
                          </th>
                          <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">
                            Sales
                          </th>
                          <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">
                            Items
                          </th>
                          <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">
                            Sold
                          </th>
                          <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">
                            Sell-Through %
                          </th>
                          <th className="px-6 py-3 text-right text-sm font-medium text-warm-900 dark:text-warm-100">
                            GMV
                          </th>
                          <th className="px-6 py-3 text-right text-sm font-medium text-warm-900 dark:text-warm-100">
                            Platform Revenue
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">
                            Last Sale
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                        {organizers.map((org) => (
                          <tr
                            key={org.id}
                            className="hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900"
                          >
                            <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100 font-medium">
                              {org.businessName}
                            </td>
                            <td className="px-6 py-4 text-sm text-center">
                              <span
                                className={`inline-block px-3 py-1 rounded text-xs font-medium ${getTierBadgeColors(
                                  org.tier
                                )}`}
                              >
                                {org.tier}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-center text-warm-600 dark:text-warm-400">
                              {org.salesCount}
                            </td>
                            <td className="px-6 py-4 text-sm text-center text-warm-600 dark:text-warm-400">
                              {org.itemsCount}
                            </td>
                            <td className="px-6 py-4 text-sm text-center text-warm-600 dark:text-warm-400">
                              {org.soldItemsCount}
                            </td>
                            <td
                              className={`px-6 py-4 text-sm text-center font-medium ${getSellThroughColor(
                                org.sellThroughRate
                              )}`}
                            >
                              {(org.sellThroughRate * 100).toFixed(1)}%
                            </td>
                            <td className="px-6 py-4 text-sm text-right text-warm-600 dark:text-warm-400">
                              {formatCurrency(org.totalGmv)}
                            </td>
                            <td className="px-6 py-4 text-sm text-right text-warm-600 dark:text-warm-400">
                              {formatCurrency(org.platformRevenue)}
                            </td>
                            <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                              {org.lastSaleAt
                                ? new Date(org.lastSaleAt).toLocaleDateString()
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {organizers.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-warm-600 dark:text-gray-400">
                        No organizers found.
                      </p>
                    </div>
                  )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-6 flex justify-center gap-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      (p) => (
                        <button
                          key={p}
                          onClick={() => fetchOrganizers(p)}
                          className={`px-3 py-1 rounded ${
                            p === organizersPage
                              ? 'bg-amber-600 dark:bg-amber-700 text-white'
                              : 'bg-warm-200 dark:bg-gray-700 text-warm-900 dark:text-gray-300 hover:bg-warm-300 dark:hover:bg-gray-600'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Revenue Tab */}
        {activeTab === 'revenue' && (
          <div>
            {revenueError && (
              <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
                {revenueError}
              </div>
            )}

            {/* Period Selector */}
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
              <select
                value={revenuePeriod}
                onChange={(e) => setRevenuePeriod(e.target.value)}
                className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
            </div>

            {revenueLoading ? (
              <div className="text-center py-8 text-warm-600 dark:text-warm-400">
                Loading revenue data...
              </div>
            ) : revenue ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                    <p className="text-sm text-warm-600 dark:text-warm-400 mb-2">
                      Transaction Revenue
                    </p>
                    <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">
                      {formatCurrency(revenue.transactionRevenue)}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                    <p className="text-sm text-warm-600 dark:text-warm-400 mb-2">
                      Subscription Revenue
                    </p>
                    <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">
                      {formatCurrency(revenue.subscriptionRevenue)}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                    <p className="text-sm text-warm-600 dark:text-warm-400 mb-2">
                      Total Revenue
                    </p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(revenue.total)}
                    </p>
                  </div>
                </div>

                {/* Daily Revenue Chart */}
                {revenue.byDay.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
                    <h3 className="text-lg font-semibold text-warm-900 dark:text-warm-100 mb-4">
                      Daily Transaction Revenue
                    </h3>
                    <div className="flex items-end gap-1 h-48">
                      {revenue.byDay.map((day) => (
                        <div
                          key={day.date}
                          className="flex-1 flex flex-col items-center gap-2"
                        >
                          <div
                            className="w-full bg-amber-600 dark:bg-amber-500 rounded-t transition hover:opacity-80"
                            style={{
                              height: `${(day.transactionRevenue / maxDailyRevenue) * 100}%`,
                              minHeight: day.transactionRevenue > 0 ? '4px' : '0px',
                            }}
                            title={formatCurrency(day.transactionRevenue)}
                          />
                          <p className="text-xs text-warm-600 dark:text-warm-400 text-center">
                            {new Date(day.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Daily Detail Table */}
                <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">
                            Date
                          </th>
                          <th className="px-6 py-3 text-right text-sm font-medium text-warm-900 dark:text-warm-100">
                            Transaction Revenue
                          </th>
                          <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">
                            New Organizers
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                        {revenue.byDay.map((day) => (
                          <tr
                            key={day.date}
                            className="hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900"
                          >
                            <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100 font-medium">
                              {new Date(day.date).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-sm text-right text-warm-600 dark:text-warm-400">
                              {formatCurrency(day.transactionRevenue)}
                            </td>
                            <td className="px-6 py-4 text-sm text-center text-warm-600 dark:text-warm-400">
                              {day.newOrganizers}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {revenue.byDay.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-warm-600 dark:text-gray-400">
                        No revenue data available for this period.
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
};

export default AdminReportsPage;
