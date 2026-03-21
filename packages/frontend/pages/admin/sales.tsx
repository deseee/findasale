import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';
import Layout from '../../components/Layout';

interface Sale {
  id: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
  organizerName: string;
  itemCount: number;
  revenue: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const AdminSales = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const fetchSales = async (p = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', p.toString());
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);

      const res = await api.get(`/admin/sales?${params.toString()}`);
      setSales(res.data.sales);
      setPagination(res.data.pagination);
      setPage(p);
      setError('');
    } catch (err) {
      console.error('Error fetching sales:', err);
      setError('Failed to load sales');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      fetchSales(1);
    }
  }, [user]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSales(1);
  };

  const handleDelete = async (saleId: string) => {
    try {
      setDeleting(saleId);
      await api.delete(`/admin/sales/${saleId}`);
      setSales(sales.filter(s => s.id !== saleId));
      setConfirmDelete(null);
    } catch (err) {
      console.error('Error deleting sale:', err);
      setError('Failed to delete sale');
    } finally {
      setDeleting(null);
    }
  };

  if (isLoading || loading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-warm-600 dark:text-warm-400">Loading sales...</div>
        </div>
      </Layout>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Manage Sales</h1>
          <p className="text-warm-600 dark:text-warm-400">Search, filter, and delete sales</p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Search and Filter */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
          <form onSubmit={handleSearch} className="flex flex-col gap-4 md:flex-row md:gap-4">
            <input
              type="text"
              placeholder="Search by title or organizer name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ENDED">Ended</option>
            </select>

            <button
              type="submit"
              className="px-6 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition"
            >
              Search
            </button>
          </form>
        </div>

        {/* Sales Table */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Title</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Organizer</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Status</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Items</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-warm-900 dark:text-warm-100">Revenue</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Dates</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-200">
                {sales.map(sale => (
                  <tr key={sale.id} className="hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900">
                    <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100 font-medium">{sale.title}</td>
                    <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">{sale.organizerName}</td>
                    <td className="px-6 py-4 text-sm text-center">
                      <span className={`inline-block px-3 py-1 rounded text-xs font-medium ${
                        sale.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' :
                        sale.status === 'ENDED' ? 'bg-gray-100 dark:bg-gray-700 text-gray-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {sale.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-center text-warm-600 dark:text-warm-400">{sale.itemCount}</td>
                    <td className="px-6 py-4 text-sm text-right text-warm-900 dark:text-warm-100 font-medium">
                      ${(sale.revenue / 100).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                      <div className="text-xs">
                        <p>{new Date(sale.startDate).toLocaleDateString()}</p>
                        <p className="text-warm-500 dark:text-warm-400">to {new Date(sale.endDate).toLocaleDateString()}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      <button
                        onClick={() => setConfirmDelete(sale.id)}
                        disabled={deleting === sale.id}
                        className="px-3 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700 transition disabled:opacity-50"
                      >
                        {deleting === sale.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sales.length === 0 && (
            <div className="text-center py-8">
              <p className="text-warm-600 dark:text-gray-400">No sales match your search or filters.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="mt-6 flex justify-center gap-2">
            {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => fetchSales(p)}
                className={`px-3 py-1 rounded ${
                  p === page
                    ? 'bg-amber-600 text-white'
                    : 'bg-warm-200 text-warm-900 dark:text-warm-100 hover:bg-warm-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {confirmDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm">
              <h3 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-4">Delete Sale</h3>
              <p className="text-warm-600 dark:text-warm-400 mb-6">
                Are you sure you want to permanently delete this sale? This action cannot be undone and will also delete all associated items.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md text-warm-900 dark:text-warm-100 hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(confirmDelete)}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AdminSales;
