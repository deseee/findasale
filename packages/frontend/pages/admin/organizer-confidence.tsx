import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface OrganizerConfidence {
  id: string;
  businessName: string;
  city: string | null;
  state: string | null;
  directoryConfidenceScore: number | null;
  confidenceLastCalculated: string | null;
}

interface PaginationInfo {
  page: number;
  pages: number;
  total: number;
}

const scoreBadge = (score: number | null) => {
  if (score === null || score === undefined) {
    return <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">Not scored</span>;
  }
  if (score < 0.4) {
    return (
      <span className="inline-block px-2 py-1 rounded text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
        {score.toFixed(2)}
      </span>
    );
  }
  if (score <= 0.7) {
    return (
      <span className="inline-block px-2 py-1 rounded text-xs font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
        {score.toFixed(2)}
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-1 rounded text-xs font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
      {score.toFixed(2)}
    </span>
  );
};

const AdminOrganizerConfidence = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [organizers, setOrganizers] = useState<OrganizerConfidence[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const fetchOrganizers = async (p = 1) => {
    try {
      setLoading(true);
      const res = await api.get(`/admin/organizers/confidence?page=${p}`);
      setOrganizers(res.data.organizers);
      setPagination({ page: res.data.page, pages: res.data.pages, total: res.data.total });
      setPage(p);
    } catch (err) {
      console.error('Error fetching confidence scores:', err);
      setError('Failed to load confidence scores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchOrganizers(1);
    }
  }, [user]);

  if (isLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading confidence scores...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Directory Confidence Scores</h1>
        <p className="text-warm-600 dark:text-warm-400">Organizers with low scores need enrichment attention</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <div className="flex gap-4 mb-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span>
          <span className="text-warm-600 dark:text-warm-400">Low (&lt;0.4)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-amber-500"></span>
          <span className="text-warm-600 dark:text-warm-400">Moderate (0.4–0.7)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
          <span className="text-warm-600 dark:text-warm-400">Good (&gt;0.7)</span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Organizer</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">City</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">State</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Confidence Score</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Last Calculated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
              {organizers.map((o) => (
                <tr key={o.id} className="hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900">
                  <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100 font-medium">{o.businessName}</td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">{o.city || '—'}</td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">{o.state || '—'}</td>
                  <td className="px-6 py-4 text-sm text-center">{scoreBadge(o.directoryConfidenceScore)}</td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                    {o.confidenceLastCalculated ? new Date(o.confidenceLastCalculated).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {organizers.length === 0 && (
          <div className="text-center py-8">
            <p className="text-warm-600 dark:text-gray-400">No organizer records found.</p>
          </div>
        )}
      </div>

      {pagination && (
        <div className="mt-4 flex items-center justify-between text-sm text-warm-600 dark:text-warm-400">
          <span>{pagination.total} organizers</span>
          {pagination.pages > 1 && (
            <div className="flex gap-2">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => fetchOrganizers(p)}
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

export default AdminOrganizerConfidence;
