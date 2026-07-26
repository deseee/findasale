import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface DemandSignal {
  query: string;
  city: string | null;
  searchCount: number;
  lastSearched: string;
}

interface PaginationInfo {
  page: number;
  pages: number;
  total: number;
}

const AdminDemandSignals = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [signals, setSignals] = useState<DemandSignal[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [cityFilter, setCityFilter] = useState('');
  const [minCount, setMinCount] = useState(2);
  // Raw-text mirror so the field can go through an empty intermediate
  // state while typing instead of snapping back to 1 on every keystroke.
  const [minCountText, setMinCountText] = useState(String(2));
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const fetchSignals = async (p = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', p.toString());
      params.append('minCount', minCount.toString());
      if (cityFilter) params.append('city', cityFilter);

      const res = await api.get(`/admin/demand-signals?${params.toString()}`);
      setSignals(res.data.signals);
      setPagination({ page: res.data.page, pages: res.data.pages, total: res.data.total });
      if (res.data.cities?.length) setCities(res.data.cities);
      setPage(p);
    } catch (err) {
      console.error('Error fetching demand signals:', err);
      setError('Failed to load demand signals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchSignals(1);
    }
  }, [user]);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSignals(1);
  };

  if (isLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading demand signals...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Unmet Demand Signals</h1>
        <p className="text-warm-600 dark:text-warm-400">What shoppers searched for but couldn't find</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <form onSubmit={handleFilter} className="flex flex-col gap-4 md:flex-row md:gap-4">
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
          >
            <option value="">All Cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <label className="text-sm text-warm-700 dark:text-warm-300 whitespace-nowrap">Min searches:</label>
            <input
              type="number"
              min={1}
              value={minCountText}
              onChange={(e) => setMinCountText(e.target.value)}
              onBlur={() => {
                const parsed = Math.max(1, parseInt(minCountText, 10) || 1);
                setMinCountText(String(parsed));
                setMinCount(parsed);
              }}
              className="w-20 px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            />
          </div>

          <button
            type="submit"
            className="px-6 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition"
          >
            Apply
          </button>
        </form>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Search Query</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Search Count</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">City</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Last Searched</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
              {signals.map((s, idx) => (
                <tr key={`${s.query}-${s.city}-${idx}`} className="hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900">
                  <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100 font-medium">{s.query}</td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                      {s.searchCount}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">{s.city || '—'}</td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">{new Date(s.lastSearched).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {signals.length === 0 && (
          <div className="text-center py-8">
            <p className="text-warm-600 dark:text-gray-400">No demand signals match your filters.</p>
          </div>
        )}
      </div>

      {pagination && pagination.total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-warm-600 dark:text-warm-400">
          <span>{pagination.total} unique search patterns</span>
          {pagination.pages > 1 && (
            <div className="flex gap-2">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => fetchSignals(p)}
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
      )}
    </div>
  );
};

export default AdminDemandSignals;
