import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface CanadaStats {
  totalOrganizers: number;
  totalSales: number;
  totalRevenue: number;
  topProvinces: { province: string; count: number }[];
}

interface Stats {
  totalUsers: number;
  totalOrganizers: number;
  totalItems: number;
  totalSales: number;
  totalRevenue: number;
  newUsersLast7d: number;
  newSalesLast7d: number;
  salesByStatus?: Record<string, number>;
  totalPurchases?: number;
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
  canadaStats?: CanadaStats;
  realSalesCount?: number;
  scrapedSalesCount?: number;
}

interface OutreachStats {
  totalInQueue: number;
  totalSent: number;
  totalClaimed: number;
  totalBounced: number;
  totalOptedOut: number;
  touch1: { sent: number; opened: number; clicked: number; openRate: string; clickRate: string };
  touch2: { sent: number; opened: number; clicked: number; openRate: string; clickRate: string };
  touch3: { sent: number; opened: number; clicked: number; openRate: string; clickRate: string };
  touch4: { sent: number; opened: number; clicked: number; openRate: string; clickRate: string };
  conversionRate: string;
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
  const [outreachStats, setOutreachStats] = useState<OutreachStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [geoFilter, setGeoFilter] = useState<'ALL' | 'US' | 'CA'>('ALL');
  const [drilldownOpen, setDrilldownOpen] = useState<string | null>(null);
  const [drilldownData, setDrilldownData] = useState<any>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);

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
        const statsUrl = geoFilter === 'CA' ? '/admin/stats?country=CA' : '/admin/stats';
        const [statsRes, activityRes, outreachRes] = await Promise.all([
          api.get(statsUrl),
          api.get('/admin/activity'),
          api.get('/admin/outreach-stats'),
        ]);
        setStats(statsRes.data);
        setActivity(activityRes.data);
        setOutreachStats(outreachRes.data);
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
  }, [user, geoFilter]);

  const openDrilldown = async (metric: string) => {
    if (drilldownOpen === metric) {
      setDrilldownOpen(null);
      return;
    }
    setDrilldownOpen(metric);
    setDrilldownLoading(true);
    setDrilldownData(null);
    try {
      const res = await api.get(`/admin/drilldown/${metric}`);
      setDrilldownData(res.data);
    } catch (err) {
      console.error('Error fetching drilldown:', err);
    } finally {
      setDrilldownLoading(false);
    }
  };

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

  const roleBadgeClass = (role: string) => {
    if (role === 'ADMIN') return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
    if (role === 'ORGANIZER') return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
    return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
  };

  const statusBadgeClass = (status: string) => {
    if (status === 'PUBLISHED') return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
    if (status === 'ENDED') return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Admin Dashboard</h1>
      <p className="text-warm-600 dark:text-warm-400 mb-4">Welcome, {user.name}. Manage your platform here.</p>

      {/* #370 Geography Filter */}
      <div className="flex gap-2 mb-8">
        {(['ALL', 'US', 'CA'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setGeoFilter(filter)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition border ${
              geoFilter === filter
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white dark:bg-gray-800 text-warm-700 dark:text-warm-300 border-warm-300 dark:border-gray-600 hover:border-amber-400'
            }`}
          >
            {filter === 'ALL' ? 'All Regions' : filter === 'US' ? '🇺🇸 United States' : '🇨🇦 Canada'}
          </button>
        ))}
      </div>

      {/* Row 1: Money KPIs */}
      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-amber-600">
              <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">Today's Revenue</h3>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{formatCurrency(stats.transactionRevenueToday)}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Gross · before Stripe fees</p>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-amber-600">
              <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">MRR</h3>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{formatCurrency(stats.mrr)}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Monthly recurring</p>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-amber-600">
              <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">30d Revenue</h3>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{formatCurrency(stats.transactionRevenueLast30d)}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Gross · before Stripe fees</p>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-amber-600">
              <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">Hunt Pass Revenue</h3>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{formatCurrency(stats.huntPassRevenueLast30d)}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Last 30 days</p>
            </div>
          </div>

          {/* Row 2: Platform KPIs — clickable */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-blue-500">
              <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">Total Users</h3>
              <p
                className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2 cursor-pointer hover:opacity-80 transition-opacity inline-flex items-center gap-1"
                onClick={() => openDrilldown('signups')}
                title="Click to drill down"
              >
                {stats.totalUsers} <span className="text-xl text-blue-400">{drilldownOpen === 'signups' ? '▼' : '↗'}</span>
              </p>
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
              <p
                className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2 cursor-pointer hover:opacity-80 transition-opacity inline-flex items-center gap-1"
                onClick={() => openDrilldown('sales')}
                title="Click to drill down"
              >
                {stats.totalSales} <span className="text-xl text-purple-400">{drilldownOpen === 'sales' ? '▼' : '↗'}</span>
              </p>
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

          {/* Drill-down panel */}
          {drilldownOpen && (
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-8 border border-amber-200 dark:border-amber-800">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100">
                  {drilldownOpen === 'signups' ? 'Recent Sign-ups' : drilldownOpen === 'sales' ? 'Sales Breakdown' : 'Scraped Sales'}
                </h3>
                <button aria-label="Close" onClick={() => setDrilldownOpen(null)} className="text-warm-500 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100 text-lg font-bold">✕</button>
              </div>
              {drilldownLoading ? (
                <p className="text-warm-500 dark:text-warm-400">Loading...</p>
              ) : drilldownData ? (
                <>
                  {drilldownOpen === 'signups' && drilldownData.users && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-warm-200 dark:border-gray-700">
                            <th className="text-left py-2 px-3 text-warm-600 dark:text-warm-400">Name</th>
                            <th className="text-left py-2 px-3 text-warm-600 dark:text-warm-400">Email</th>
                            <th className="text-left py-2 px-3 text-warm-600 dark:text-warm-400">Role</th>
                            <th className="text-right py-2 px-3 text-warm-600 dark:text-warm-400">Joined</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drilldownData.users.map((u: any) => (
                            <tr key={u.id} className="border-b border-warm-100 dark:border-gray-700">
                              <td className="py-2 px-3 text-warm-900 dark:text-warm-100">{u.name || '—'}</td>
                              <td className="py-2 px-3 text-warm-600 dark:text-warm-400 text-xs">{u.email}</td>
                              <td className="py-2 px-3">
                                {(u.roles || []).map((r: string) => (
                                  <span key={r} className={`text-xs px-2 py-0.5 rounded mr-1 ${roleBadgeClass(r)}`}>{r}</span>
                                ))}
                              </td>
                              <td className="py-2 px-3 text-right text-warm-500 dark:text-warm-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {drilldownOpen === 'sales' && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                        {[
                          { label: 'Real Sales', value: drilldownData.real ?? 0, color: 'emerald' },
                          { label: 'Scraped', value: drilldownData.scraped ?? 0, color: 'gray' },
                          { label: 'Claimed', value: drilldownData.claimed ?? 0, color: 'blue' },
                          { label: 'Published', value: drilldownData.published ?? 0, color: 'green' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className={`text-center p-3 bg-${color}-50 dark:bg-${color}-900/20 rounded border border-${color}-100 dark:border-${color}-800`}>
                            <p className={`text-2xl font-bold text-${color}-900 dark:text-${color}-100`}>{value.toLocaleString()}</p>
                            <p className={`text-xs text-${color}-600 dark:text-${color}-400 mt-1`}>{label}</p>
                          </div>
                        ))}
                      </div>
                      {drilldownData.recentReal && drilldownData.recentReal.length > 0 && (
                        <div className="overflow-x-auto">
                          <p className="text-xs font-medium text-warm-600 dark:text-warm-400 mb-2 uppercase">20 Most Recent Real Sales</p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-warm-200 dark:border-gray-700">
                                <th className="text-left py-2 px-3 text-warm-600 dark:text-warm-400">Title</th>
                                <th className="text-left py-2 px-3 text-warm-600 dark:text-warm-400">Organizer</th>
                                <th className="text-center py-2 px-3 text-warm-600 dark:text-warm-400">Status</th>
                                <th className="text-right py-2 px-3 text-warm-600 dark:text-warm-400">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {drilldownData.recentReal.map((s: any) => (
                                <tr key={s.id} className="border-b border-warm-100 dark:border-gray-700">
                                  <td className="py-2 px-3 text-warm-900 dark:text-warm-100">{s.title}</td>
                                  <td className="py-2 px-3 text-warm-600 dark:text-warm-400">{s.organizer?.businessName || '—'}</td>
                                  <td className="py-2 px-3 text-center">
                                    <span className={`text-xs px-2 py-0.5 rounded ${statusBadgeClass(s.status)}`}>{s.status}</span>
                                  </td>
                                  <td className="py-2 px-3 text-right text-warm-500 dark:text-warm-400 text-xs">{new Date(s.createdAt).toLocaleDateString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}

                  {drilldownOpen === 'scrapedsales' && drilldownData.sales && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-warm-200 dark:border-gray-700">
                            <th className="text-left py-2 px-3 text-warm-600 dark:text-warm-400">Title</th>
                            <th className="text-left py-2 px-3 text-warm-600 dark:text-warm-400">Organizer</th>
                            <th className="text-center py-2 px-3 text-warm-600 dark:text-warm-400">Status</th>
                            <th className="text-center py-2 px-3 text-warm-600 dark:text-warm-400">Claimed</th>
                            <th className="text-right py-2 px-3 text-warm-600 dark:text-warm-400">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drilldownData.sales.map((s: any) => (
                            <tr key={s.id} className="border-b border-warm-100 dark:border-gray-700">
                              <td className="py-2 px-3 text-warm-900 dark:text-warm-100">{s.title}</td>
                              <td className="py-2 px-3 text-warm-600 dark:text-warm-400">{s.organizer?.businessName || '—'}</td>
                              <td className="py-2 px-3 text-center">
                                <span className={`text-xs px-2 py-0.5 rounded ${statusBadgeClass(s.status)}`}>{s.status}</span>
                              </td>
                              <td className="py-2 px-3 text-center">
                                {s.organizer?.isClaimed
                                  ? <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Claimed</span>
                                  : <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">Unclaimed</span>
                                }
                              </td>
                              <td className="py-2 px-3 text-right text-warm-500 dark:text-warm-400 text-xs">{new Date(s.createdAt).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {drilldownOpen === 'real-organizers' && drilldownData?.organizers && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-warm-200 dark:border-gray-700">
                            <th className="text-left py-2 px-3 text-warm-600 dark:text-warm-400">Business</th>
                            <th className="text-left py-2 px-3 text-warm-600 dark:text-warm-400">Email</th>
                            <th className="text-center py-2 px-3 text-warm-600 dark:text-warm-400">Tier</th>
                            <th className="text-center py-2 px-3 text-warm-600 dark:text-warm-400">Claimed</th>
                            <th className="text-right py-2 px-3 text-warm-600 dark:text-warm-400">Joined</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drilldownData.organizers.map((o: any) => (
                            <tr key={o.id} className="border-b border-warm-100 dark:border-gray-700">
                              <td className="py-2 px-3 text-warm-900 dark:text-warm-100">{o.businessName || '—'}</td>
                              <td className="py-2 px-3 text-warm-600 dark:text-warm-400 text-xs">{o.contactEmail || '—'}</td>
                              <td className="py-2 px-3 text-center">
                                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">{o.subscriptionTier}</span>
                              </td>
                              <td className="py-2 px-3 text-center">
                                {o.isClaimed
                                  ? <span className="text-xs px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Yes</span>
                                  : <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">No</span>
                                }
                              </td>
                              <td className="py-2 px-3 text-right text-warm-500 dark:text-warm-400 text-xs">{new Date(o.createdAt).toLocaleDateString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

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
                      const maxVal = Math.max(...(stats.sparklines?.signups ?? [0]), 1);
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
                <p
                  className="text-2xl font-bold text-warm-900 dark:text-warm-100 cursor-pointer hover:opacity-80 transition-opacity inline-flex items-center gap-1"
                  onClick={() => openDrilldown('signups')}
                  title="Click to drill down"
                >
                  {(stats.sparklines?.signups ?? []).reduce((a, b) => a + b, 0)}
                  <span className="text-lg text-cyan-400">{drilldownOpen === 'signups' ? '▼' : '↗'}</span>
                </p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Total this week</p>
              </div>

              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-green-500">
                <h3 className="text-sm font-medium uppercase text-warm-600 dark:text-warm-400 mb-4">Daily Revenue (7d)</h3>
                <div className="flex items-end gap-1 h-16 mb-4">
                  {stats.sparklines.transactionRevenue.length > 0 ? (
                    stats.sparklines.transactionRevenue.map((value, idx) => {
                      const maxVal = Math.max(...(stats.sparklines?.transactionRevenue ?? [0]), 1);
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
                <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{formatCurrency((stats.sparklines?.transactionRevenue ?? []).reduce((a, b) => a + b, 0))}</p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Total this week</p>
              </div>

              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-pink-500">
                <h3 className="text-sm font-medium uppercase text-warm-600 dark:text-warm-400 mb-4">New Sales (7d)</h3>
                <div className="flex items-end gap-1 h-16 mb-4">
                  {stats.sparklines.newSales.length > 0 ? (
                    stats.sparklines.newSales.map((value, idx) => {
                      const maxVal = Math.max(...(stats.sparklines?.newSales ?? [0]), 1);
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
                <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{(stats.sparklines?.newSales ?? []).reduce((a, b) => a + b, 0)}</p>
                <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Total this week</p>
              </div>
            </div>
          )}

          {/* Outreach Email Pipeline */}
          {outreachStats && (
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-8 border-l-4 border-violet-500">
              <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-4">Outreach Email Pipeline</h3>

              {/* Summary row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                <div className="text-center p-3 bg-violet-50 dark:bg-violet-900/20 rounded">
                  <p className="text-2xl font-bold text-violet-900 dark:text-violet-100">{outreachStats.totalInQueue.toLocaleString()}</p>
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">In Queue</p>
                </div>
                <div className="text-center p-3 bg-violet-50 dark:bg-violet-900/20 rounded">
                  <p className="text-2xl font-bold text-violet-900 dark:text-violet-100">{outreachStats.totalSent.toLocaleString()}</p>
                  <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">Sent</p>
                </div>
                <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded">
                  <p className="text-2xl font-bold text-green-900 dark:text-green-100">{outreachStats.totalClaimed.toLocaleString()}</p>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">Claimed</p>
                </div>
                <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded">
                  <p className="text-2xl font-bold text-red-900 dark:text-red-100">{outreachStats.totalBounced.toLocaleString()}</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">Bounced</p>
                </div>
                <div className="text-center p-3 bg-amber-50 dark:bg-amber-900/20 rounded">
                  <p className="text-2xl font-bold text-amber-900 dark:text-amber-100">{outreachStats.conversionRate}</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Conversion Rate</p>
                </div>
              </div>

              {/* Touch sequence table */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-warm-200 dark:border-gray-700">
                    <th className="text-left py-2 text-warm-600 dark:text-warm-400">Touch</th>
                    <th className="text-right py-2 text-warm-600 dark:text-warm-400">Sent</th>
                    <th className="text-right py-2 text-warm-600 dark:text-warm-400">Opened</th>
                    <th className="text-right py-2 text-warm-600 dark:text-warm-400">Open Rate</th>
                    <th className="text-right py-2 text-warm-600 dark:text-warm-400">Clicked</th>
                    <th className="text-right py-2 text-warm-600 dark:text-warm-400">Click Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {([1, 2, 3, 4] as const).map((n) => {
                    const t = outreachStats[`touch${n}` as keyof OutreachStats] as OutreachStats['touch1'];
                    return (
                      <tr key={n} className="border-b border-warm-100 dark:border-gray-700">
                        <td className="py-2 text-warm-900 dark:text-warm-100 font-medium">Touch {n}</td>
                        <td className="py-2 text-right text-warm-700 dark:text-warm-300">{t.sent.toLocaleString()}</td>
                        <td className="py-2 text-right text-warm-700 dark:text-warm-300">{t.opened.toLocaleString()}</td>
                        <td className="py-2 text-right font-medium text-green-600 dark:text-green-400">{t.openRate}</td>
                        <td className="py-2 text-right text-warm-700 dark:text-warm-300">{t.clicked.toLocaleString()}</td>
                        <td className="py-2 text-right font-medium text-blue-600 dark:text-blue-400">{t.clickRate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-4 text-right">
                <a
                  href="/admin/outreach-opens"
                  className="inline-flex items-center gap-1 text-sm font-medium text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-200"
                >
                  View opened emails →
                </a>
              </div>
            </div>
          )}

          {/* Data Integrity */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-8 border-l-4 border-emerald-500">
            <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-1">Data Integrity</h3>
            <p className="text-xs text-warm-500 dark:text-warm-400 mb-4">Scraped/test data is isolated. It cannot appear in metrics, revenue, or shopper views without an organizer claiming the listing.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded border border-emerald-100 dark:border-emerald-800 cursor-pointer hover:opacity-80 transition" onClick={() => openDrilldown('sales')}>
                <p className="text-xl font-bold text-emerald-900 dark:text-emerald-100">{(stats.realSalesCount ?? stats.totalSales).toLocaleString()}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Real Sales</p>
                <p className="text-[10px] text-emerald-500 dark:text-emerald-500 mt-0.5">Managed organizers</p>
              </div>
              <div
                className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded border border-gray-200 dark:border-gray-600 cursor-pointer hover:border-gray-400 transition"
                onClick={() => openDrilldown('scrapedsales')}
                title="Click to view scraped sales"
              >
                <p className="text-xl font-bold text-gray-700 dark:text-gray-300">{(stats.scrapedSalesCount ?? 0).toLocaleString()}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Scraped / Unclaimed ↗</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Isolated — click to view</p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-800 cursor-pointer hover:opacity-80 transition" onClick={() => openDrilldown('real-organizers')}>
                <p className="text-xl font-bold text-blue-900 dark:text-blue-100">{stats.totalOrganizers.toLocaleString()}</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Real Organizers</p>
                <p className="text-[10px] text-blue-500 dark:text-blue-500 mt-0.5">isUnmanagedListing: false</p>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-100 dark:border-amber-800 cursor-pointer hover:opacity-80 transition" onClick={() => openDrilldown('signups')}>
                <p className="text-xl font-bold text-amber-900 dark:text-amber-100">{stats.totalUsers.toLocaleString()}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Real Users</p>
                <p className="text-[10px] text-amber-500 dark:text-amber-500 mt-0.5">Excl. @system.finda.sale / @example.com</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* #370 Canada Analytics Cards */}
      {geoFilter === 'CA' && stats?.canadaStats && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-4 flex items-center gap-2">
            <span>🇨🇦</span> Canada Overview
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-red-500">
              <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">CA Organizers</h3>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{stats.canadaStats.totalOrganizers}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Canadian accounts</p>
            </div>
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-red-500">
              <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">CA Sales</h3>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{stats.canadaStats.totalSales}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Total sales by CA organizers</p>
            </div>
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-red-500">
              <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">CA Revenue</h3>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{formatCurrency(stats.canadaStats.totalRevenue)}</p>
              <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">Total purchase value</p>
            </div>
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-red-500">
              <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">Top Provinces</h3>
              <div className="mt-2 space-y-1">
                {stats.canadaStats.topProvinces.length > 0 ? (
                  stats.canadaStats.topProvinces.map((p) => (
                    <div key={p.province} className="flex justify-between text-sm">
                      <span className="text-warm-700 dark:text-warm-300 font-medium">{p.province}</span>
                      <span className="text-warm-500 dark:text-warm-400">{p.count}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-warm-500 dark:text-warm-400 text-sm">No province data yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <Link href="/admin/users" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Manage Users</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">View and manage all users, update roles</p>
        </Link>

        <Link href="/admin/sales" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Manage Sales</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">View and delete sales, monitor activity</p>
        </Link>

        <Link href="/admin/verification" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-green-50 dark:bg-green-900/20 border border-green-100 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Verification</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">Review pending organizer verifications</p>
        </Link>

        <Link href="/admin/bid-review" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-red-50 dark:bg-red-900/20 border border-red-100 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Bid Review</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">Monitor bid IP records for fraud</p>
        </Link>

        <Link href="/admin/invites" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-amber-50 dark:bg-amber-900/20 border border-amber-100 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Beta Invites</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">Generate and manage organizer invite codes</p>
        </Link>

        <Link href="/admin/feedback" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-blue-50 dark:bg-blue-900/20 border border-blue-100 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Feedback</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">Review user feedback and survey responses</p>
        </Link>

        <Link href="/creator/dashboard" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-purple-50 dark:bg-purple-900/20 border border-purple-100 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Creator Program</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">View creator/affiliate dashboard and analytics</p>
        </Link>

        <Link href="/admin/creators" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Creators Admin</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">Manage all affiliates — codes, clicks, referrals, earnings</p>
        </Link>

        <Link href="/admin/scraper" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-green-50 dark:bg-green-900/20 border border-green-100 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Scraper Management</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">Trigger scrape runs, view sources, monitor results</p>
        </Link>

        <Link href="/admin/scrape-pool" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-teal-50 dark:bg-teal-900/20 border border-teal-100 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Scrape Pool</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">Outreach pipeline, lead scores, email coverage</p>
        </Link>

        <Link href="/admin/demand-signals" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-orange-50 dark:bg-orange-900/20 border border-orange-100 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Demand Signals</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">What shoppers searched for but couldn't find</p>
        </Link>

        <Link href="/admin/waitlist" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-sky-50 dark:bg-sky-900/20 border border-sky-100 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Notify Me Waitlist</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">Shoppers waiting for specific item types to go on sale</p>
        </Link>

        <Link href="/admin/organizer-confidence" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-rose-50 dark:bg-rose-900/20 border border-rose-100 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">Confidence Scores</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">Directory organizers sorted by data completeness score</p>
        </Link>

        <Link href="/admin/ai-usage" className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 hover:shadow-lg hover:bg-violet-50 dark:bg-violet-900/20 border border-violet-100 transition">
          <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">AI Spend</h3>
          <p className="text-warm-600 dark:text-warm-400 text-sm">Live cost tracking across tagging, web detection, eBay search, and grounding</p>
        </Link>
      </div>

      {/* Recent Activity */}
      {activity && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Purchases */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 min-w-0">
            <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-4">Recent Purchases</h3>
            <div className="space-y-3">
              {activity.recentPurchases.length > 0 ? (
                activity.recentPurchases.slice(0, 5).map(purchase => (
                  <Link key={purchase.id} href={purchase.itemId ? `/items/${purchase.itemId}` : (purchase.saleId ? `/sales/${purchase.saleId}` : '/admin/users')} className="block cursor-pointer hover:bg-warm-50 dark:hover:bg-gray-700/50 rounded transition">
                  <div className="border-b border-warm-200 dark:border-gray-700 pb-3 last:border-0 text-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-warm-900 dark:text-warm-100">{purchase.user?.name || 'Unknown'}</p>
                        <p className="text-warm-600 dark:text-warm-400">{purchase.item?.title || 'Item'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-warm-900 dark:text-warm-100">${(purchase.amount).toFixed(2)}</p>
                        <p className={`text-xs ${purchase.status === 'PAID' ? 'text-green-600' : 'text-yellow-600'}`}>
                          {purchase.status}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">{new Date(purchase.createdAt).toLocaleDateString()}</p>
                  </div>
                  </Link>
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
                  <Link key={newUser.id} href="/admin/users" className="block cursor-pointer hover:bg-warm-50 dark:hover:bg-gray-700/50 rounded transition">
                  <div className="border-b border-warm-200 dark:border-gray-700 pb-3 last:border-0 text-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-warm-900 dark:text-warm-100">{newUser.name}</p>
                        <p className="text-warm-600 dark:text-warm-400 text-xs">{newUser.email}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${roleBadgeClass(newUser.role)}`}>
                        {newUser.role}
                      </span>
                    </div>
                    <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">{new Date(newUser.createdAt).toLocaleDateString()}</p>
                  </div>
                  </Link>
                ))
              ) : (
                <p className="text-warm-500 dark:text-warm-400">No recent users</p>
              )}
            </div>
          </div>

          {/* Recent Sales */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 lg:col-span-2 min-w-0">
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
                        <td className="px-4 py-2 text-warm-600 dark:text-warm-400">{sale.organizer?.businessName || 'Unknown'}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-xs px-2 py-1 rounded ${statusBadgeClass(sale.status)}`}>
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
