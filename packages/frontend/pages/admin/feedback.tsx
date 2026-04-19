import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface Feedback {
  id: string;
  rating: number | null;
  text: string | null;
  page: string | null;
  createdAt: string;
  user?: {
    name: string;
    email: string;
  };
}

interface FeedbackStats {
  totalFeedback: number;
  averageRating: number;
  ratingBreakdown: Record<string, number>;
  recentFeedback: Feedback[];
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const AdminFeedback = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [ratingFilter, setRatingFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const fetchStats = async () => {
    try {
      const res = await api.get('/feedback/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Error fetching feedback stats:', err);
    }
  };

  const fetchFeedback = async (p = 1) => {
    try {
      const params = new URLSearchParams();
      params.append('page', p.toString());
      if (ratingFilter) params.append('rating', ratingFilter);
      if (search) params.append('search', search);

      const res = await api.get(`/feedback?${params.toString()}`);
      setFeedbacks(res.data.feedbacks);
      setPagination(res.data.pagination);
      setPage(p);
    } catch (err) {
      console.error('Error fetching feedback:', err);
      setError('Failed to load feedback');
    }
  };

  const loadAllData = async () => {
    try {
      setLoading(true);
      await Promise.all([fetchStats(), fetchFeedback(1)]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      loadAllData();
    }
  }, [user]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFeedback(1);
  };

  if (isLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading feedback data...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <Link href="/admin" className="text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100 underline text-sm mb-6 inline-block">
        ← Back to Dashboard
      </Link>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">User Feedback</h1>
        <p className="text-warm-600 dark:text-warm-400">Review feedback and survey responses</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-amber-600">
            <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">Total Feedback</h3>
            <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">{stats.totalFeedback}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-blue-500">
            <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">Avg Rating</h3>
            <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">
              {stats.averageRating ? stats.averageRating.toFixed(1) : '—'}
            </p>
            <p className="text-xs text-warm-500 dark:text-warm-400 mt-1">/ 5.0</p>
          </div>

          {[1, 2, 3, 4, 5].map(rating => (
            <div key={rating} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border-l-4 border-green-500">
              <h3 className="text-warm-600 dark:text-warm-400 text-sm font-medium uppercase">{rating}★ Feedback</h3>
              <p className="text-3xl font-bold text-warm-900 dark:text-warm-100 mt-2">
                {stats.ratingBreakdown[rating.toString()] || 0}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Search and Filter */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <form onSubmit={handleSearch} className="flex flex-col gap-4 md:flex-row md:gap-4">
          <input
            type="text"
            placeholder="Search by name, email, or comment text..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
          />

          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value)}
            className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
          >
            <option value="">All Ratings</option>
            <option value="1">1 Star</option>
            <option value="2">2 Stars</option>
            <option value="3">3 Stars</option>
            <option value="4">4 Stars</option>
            <option value="5">5 Stars</option>
          </select>

          <button
            type="submit"
            className="px-6 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition"
          >
            Search
          </button>
        </form>
      </div>

      {/* Feedback Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Rating</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Comment</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Page</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">User</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
              {feedbacks.map(fb => (
                <tr key={fb.id} className="hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900">
                  <td className="px-6 py-4 text-sm">
                    {fb.rating ? (
                      <span className="inline-block px-3 py-1 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300">
                        {fb.rating}★
                      </span>
                    ) : (
                      <span className="text-warm-500 dark:text-warm-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100 max-w-xs truncate">
                    {fb.text || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                    {fb.page || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100">
                    {fb.user?.name || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                    {fb.user?.email || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                    {new Date(fb.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {feedbacks.length === 0 && (
          <div className="text-center py-8">
            <p className="text-warm-600 dark:text-gray-400">No feedback found.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => fetchFeedback(p)}
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

export default AdminFeedback;
