import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface Referral {
  id: string;
  status: string;
  qualifiedAt: string | null;
  payoutAmountCents: number | null;
  paidAt: string | null;
  referredUser: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
  };
}

interface Creator {
  id: string;
  name: string;
  email: string;
  joinedAt: string;
  affiliateCode: string | null;
  totalClicks: number;
  totalConversions: number;
  totalReferrals: number;
  convertedReferrals: number;
  totalEarningsCents: number;
  referrals: Referral[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface Summary {
  totalCreators: number;
  totalClicks: number;
  totalConversions: number;
  totalReferrals: number;
  convertedReferrals: number;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  QUALIFIED: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  PAID: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  CANCELLED: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
};

function formatDollars(cents: number | null | undefined): string {
  if (!cents) return '$0.00';
  return `$${(cents / 100).toFixed(2)}`;
}

const AdminCreators = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [creators, setCreators] = useState<Creator[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login?redirect=/admin/creators');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!isLoading && user && !user.roles?.includes('ADMIN')) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  const fetchCreators = useCallback(async (p = 1, q = search) => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ page: p.toString() });
      if (q) params.append('search', q);
      const res = await api.get(`/admin/affiliate/creators?${params.toString()}`);
      setCreators(res.data.creators);
      setPagination(res.data.pagination);
      setSummary(res.data.summary);
      setPage(p);
    } catch (err) {
      console.error('Error fetching creators:', err);
      setError('Failed to load creators.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchCreators(1, '');
    }
  }, [user]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCreators(1, search);
  };

  const toggleExpanded = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (isLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading creators...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Creator & Affiliate Management</h1>
        <p className="text-warm-600 dark:text-warm-400">
          All users with affiliate links or referral codes. Click a row to expand referral details.
        </p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Stats Bar */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{summary.totalCreators}</p>
            <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">Total Creators</p>
          </div>
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{summary.totalClicks.toLocaleString()}</p>
            <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">Total Clicks</p>
          </div>
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{summary.totalConversions.toLocaleString()}</p>
            <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">Total Conversions</p>
          </div>
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{summary.totalReferrals.toLocaleString()}</p>
            <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">
              Referrals{' '}
              <span className="text-xs text-green-600 dark:text-green-400">
                ({summary.convertedReferrals} converted)
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <form onSubmit={handleSearch} className="flex flex-col gap-4 md:flex-row md:items-center md:gap-4">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); fetchCreators(1, ''); }}
              className="px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300 rounded-md hover:bg-warm-50 dark:hover:bg-gray-700 transition"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Code</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Clicks</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Conversions</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Referrals</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Converted</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-warm-900 dark:text-warm-100">Earnings</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Joined</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
              {creators.map((c) => (
                <React.Fragment key={c.id}>
                  <tr
                    onClick={() => toggleExpanded(c.id)}
                    className="hover:bg-amber-50 dark:hover:bg-gray-700 cursor-pointer dark:bg-gray-900"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-warm-900 dark:text-warm-100">{c.name || '—'}</td>
                    <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">{c.email}</td>
                    <td className="px-6 py-4 text-sm">
                      {c.affiliateCode ? (
                        <span className="font-mono text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                          {c.affiliateCode}
                        </span>
                      ) : (
                        <span className="text-warm-400 dark:text-warm-500 text-xs">none</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-warm-600 dark:text-warm-400">{c.totalClicks}</td>
                    <td className="px-6 py-4 text-sm text-center text-warm-600 dark:text-warm-400">{c.totalConversions}</td>
                    <td className="px-6 py-4 text-sm text-center text-warm-600 dark:text-warm-400">{c.totalReferrals}</td>
                    <td className="px-6 py-4 text-sm text-center">
                      {c.convertedReferrals > 0 ? (
                        <span className="text-green-600 dark:text-green-400 font-medium">{c.convertedReferrals}</span>
                      ) : (
                        <span className="text-warm-400 dark:text-warm-500">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-warm-900 dark:text-warm-100">
                      {formatDollars(c.totalEarningsCents)}
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                      {new Date(c.joinedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggleExpanded(c.id)}
                        className="px-3 py-1 text-xs rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition"
                      >
                        {expandedId === c.id ? 'Close' : 'Referrals'}
                      </button>
                    </td>
                  </tr>

                  {/* Expanded referral detail row */}
                  {expandedId === c.id && (
                    <tr className="bg-warm-50 dark:bg-gray-900/60">
                      <td colSpan={10} className="px-8 py-4">
                        <div className="text-sm font-medium text-warm-900 dark:text-warm-100 mb-3">
                          Referral History for {c.name || c.email}
                        </div>
                        {c.referrals.length === 0 ? (
                          <p className="text-sm text-warm-500 dark:text-warm-500">No referrals recorded.</p>
                        ) : (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-warm-200 dark:border-gray-700">
                                <th className="py-2 text-left font-medium text-warm-700 dark:text-warm-300">Referred User</th>
                                <th className="py-2 text-left font-medium text-warm-700 dark:text-warm-300">Email</th>
                                <th className="py-2 text-left font-medium text-warm-700 dark:text-warm-300">Status</th>
                                <th className="py-2 text-left font-medium text-warm-700 dark:text-warm-300">Qualified</th>
                                <th className="py-2 text-right font-medium text-warm-700 dark:text-warm-300">Payout</th>
                                <th className="py-2 text-left font-medium text-warm-700 dark:text-warm-300">Paid</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-warm-100 dark:divide-gray-800">
                              {c.referrals.map((r) => (
                                <tr key={r.id} className="hover:bg-amber-50 dark:hover:bg-gray-700/40">
                                  <td className="py-2 text-warm-900 dark:text-warm-100">{r.referredUser?.name || '—'}</td>
                                  <td className="py-2 text-warm-600 dark:text-warm-400">{r.referredUser?.email || '—'}</td>
                                  <td className="py-2">
                                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] || STATUS_COLORS.CANCELLED}`}>
                                      {r.status}
                                    </span>
                                  </td>
                                  <td className="py-2 text-warm-600 dark:text-warm-400">
                                    {r.qualifiedAt ? new Date(r.qualifiedAt).toLocaleDateString() : '—'}
                                  </td>
                                  <td className="py-2 text-right text-warm-900 dark:text-warm-100 font-medium">
                                    {formatDollars(r.payoutAmountCents)}
                                  </td>
                                  <td className="py-2 text-warm-600 dark:text-warm-400">
                                    {r.paidAt ? new Date(r.paidAt).toLocaleDateString() : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {creators.length === 0 && !loading && (
          <div className="text-center py-8">
            <p className="text-warm-600 dark:text-gray-400">No creators match your search.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => fetchCreators(p, search)}
              className={`px-3 py-1 rounded ${
                p === page
                  ? 'bg-amber-600 dark:bg-amber-700 text-white'
                  : 'bg-warm-200 dark:bg-gray-700 text-warm-900 dark:text-gray-300 hover:bg-warm-300 dark:hover:bg-gray-600'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminCreators;
