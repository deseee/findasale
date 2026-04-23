import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface Item {
  id: string;
  title: string;
  price: number;
  status: string;
  category: string | null;
  photoUrl: string | null;
  organizerName: string;
  saleTitle: string;
  createdAt: string;
}

interface ItemsResponse {
  items: Item[];
  total: number;
  page: number;
  pages: number;
}

const AdminItems = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [pagination, setPagination] = useState<{ page: number; total: number; pages: number } | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const fetchItems = useCallback(async (p = 1, searchTerm = '', statusFilter = '') => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', p.toString());
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter) params.append('status', statusFilter);

      const res = await api.get(`/admin/items?${params.toString()}`);
      setItems(res.data.items || []);
      setPagination(res.data.pagination || { page: p, total: 0, pages: 1 });
      setPage(p);
      setError('');
    } catch (err) {
      console.error('Error fetching items:', err);
      setError('Failed to load items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchItems(1, '', '');
    }
  }, [user, fetchItems]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);

    if (searchTimeout) clearTimeout(searchTimeout);

    const timeout = setTimeout(() => {
      fetchItems(1, value, status);
    }, 300);

    setSearchTimeout(timeout);
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setStatus(value);
    fetchItems(1, search, value);
  };

  const openItemInNewTab = (id: string) => {
    window.open(`/organizer/edit-item/${id}`, '_blank');
  };

  const formatPrice = (priceInCents: number) => {
    if (!priceInCents && priceInCents !== 0) return '—';
    return (priceInCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return '—';
    }
  };

  const getStatusBadgeColor = (s: string) => {
    switch (s) {
      case 'PUBLISHED':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
      case 'DRAFT':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
      case 'SOLD':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300';
      case 'ARCHIVED':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
      default:
        return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  };

  if (isLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading items...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Manage Items</h1>
        <p className="text-warm-600 dark:text-warm-400">Search and filter items across all organizers</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Search and Filter */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <div className="flex flex-col gap-4 flex-wrap md:flex-row md:gap-4">
          <input
            type="text"
            placeholder="Search items by title..."
            value={search}
            onChange={handleSearchChange}
            className="flex-1 min-w-0 px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
          />

          <select
            value={status}
            onChange={handleStatusChange}
            className="px-4 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600 flex-shrink-0"
          >
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="SOLD">Sold</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {/* Items Grid */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Photo</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Title</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Price</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Organizer</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Sale</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Created</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-warm-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4">
                    {item.photoUrl ? (
                      <img
                        src={item.photoUrl}
                        alt={item.title}
                        className="w-12 h-12 rounded object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-gray-200 dark:bg-gray-700" />
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100 font-medium max-w-xs truncate">
                    {item.title || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100">{formatPrice(item.price)}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`inline-block px-3 py-1 rounded text-xs font-medium ${getStatusBadgeColor(item.status)}`}>
                      {item.status || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400 truncate">
                    {item.organizerName || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400 truncate">
                    {item.saleTitle || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                    {formatDate(item.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <button
                      onClick={() => openItemInNewTab(item.id)}
                      className="text-amber-600 dark:text-amber-400 hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {items.length === 0 && (
          <div className="text-center py-12">
            <p className="text-warm-600 dark:text-gray-400">No items found. Try adjusting your search or filters.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => fetchItems(p, search, status)}
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

export default AdminItems;
