import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface WaitlistEntry {
  id: string;
  itemType: string;
  city: string | null;
  state: string | null;
  isActive: boolean;
  createdAt: string;
  notifiedAt: string | null;
  user: { email: string; name: string };
}

interface PaginationInfo {
  page: number;
  pages: number;
  total: number;
}

const AdminWaitlist = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const fetchEntries = async (p = 1, active = activeOnly) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', p.toString());
      params.append('activeOnly', active.toString());

      const res = await api.get(`/admin/waitlist?${params.toString()}`);
      setEntries(res.data.entries);
      setPagination({ page: res.data.page, pages: res.data.pages, total: res.data.total });
      setPage(p);
    } catch (err) {
      console.error('Error fetching waitlist:', err);
      setError('Failed to load waitlist entries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchEntries(1, activeOnly);
    }
  }, [user]);

  const handleToggleActive = (val: boolean) => {
    setActiveOnly(val);
    fetchEntries(1, val);
  };

  if (isLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading waitlist...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Shopper Notify Me Waitlist</h1>
        <p className="text-warm-600 dark:text-warm-400">Shoppers waiting to be notified when specific item types go on sale</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6 flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => handleToggleActive(e.target.checked)}
            className="w-4 h-4 accent-amber-600"
          />
          <span className="text-sm text-warm-700 dark:text-warm-300">Active subscriptions only</span>
        </label>
        {pagination && (
          <span className="text-sm text-warm-500 dark:text-warm-400">{pagination.total} entries</span>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Item Type</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">User Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">City</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Active</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900">
                  <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100 font-medium">{e.itemType}</td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">{e.user?.email || '—'}</td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                    {[e.city, e.state].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    {e.isActive ? (
                      <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Active</span>
                    ) : (
                      <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Inactive</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">{new Date(e.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {entries.length === 0 && (
          <div className="text-center py-8">
            <p className="text-warm-600 dark:text-gray-400">No waitlist entries found.</p>
          </div>
        )}
      </div>

      {pagination && pagination.pages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => fetchEntries(p)}
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

export default AdminWaitlist;
