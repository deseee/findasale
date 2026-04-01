/**
 * OrganizerHoldsPanel Component
 * Feature #121: Dashboard for organizers to manage holds on their sales.
 * Displays holds with filters, batch actions (release/extend/markSold), and settings.
 */

import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import HoldTimer from './HoldTimer';

interface Hold {
  id: string;
  status: string;
  expiresAt: string;
  fraudScore?: number;
  fraudFlags?: string[];
  user: {
    id: string;
    name: string;
    email: string;
  };
  item: {
    id: string;
    title: string;
    price?: number;
    photoUrls?: string[];
    sale: {
      id: string;
      title: string;
    };
  };
  createdAt: string;
}

interface HoldsResponse {
  holds: Hold[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface OrganizerHoldsPanelProps {
  className?: string;
}

const OrganizerHoldsPanel: React.FC<OrganizerHoldsPanelProps> = ({ className = '' }) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [holds, setHolds] = useState<Hold[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedHolds, setSelectedHolds] = useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = useState<'release' | 'extend' | 'markSold' | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'expiry' | 'created'>('expiry');
  const [saleFilter, setSaleFilter] = useState<string>('');

  useEffect(() => {
    fetchHolds();
  }, [page, sortBy, saleFilter]);

  const fetchHolds = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
        sort: sortBy,
      });
      if (saleFilter) params.append('saleId', saleFilter);

      const resp = await api.get(`/reservations/organizer?${params}`);
      setHolds(resp.data.holds);
      setTotalPages(resp.data.pages);
    } catch (err) {
      showToast('Failed to load holds', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectHold = (holdId: string) => {
    const newSelected = new Set(selectedHolds);
    if (newSelected.has(holdId)) {
      newSelected.delete(holdId);
    } else {
      newSelected.add(holdId);
    }
    setSelectedHolds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedHolds.size === holds.length) {
      setSelectedHolds(new Set());
    } else {
      setSelectedHolds(new Set(holds.map((h) => h.id)));
    }
  };

  const handleBatchAction = async (action: 'release' | 'extend' | 'markSold') => {
    if (selectedHolds.size === 0) {
      showToast('Select at least one hold', 'info');
      return;
    }

    setBatchLoading(true);
    try {
      await api.post('/reservations/batch', {
        ids: Array.from(selectedHolds),
        action,
      });

      const actionText =
        action === 'release' ? 'released' : action === 'extend' ? 'extended' : 'marked as sold';
      showToast(`${selectedHolds.size} hold(s) ${actionText}`, 'success');

      setSelectedHolds(new Set());
      fetchHolds();
    } catch (err) {
      showToast(`Failed to ${action} holds`, 'error');
    } finally {
      setBatchLoading(false);
    }
  };

  if (!user?.roles?.includes('ORGANIZER')) {
    return null;
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="border-b border-gray-200 p-6">
        <h2 className="text-2xl font-bold text-gray-900">Manage Holds</h2>
        <p className="text-gray-600 mt-1">Feature #121: Track and manage item holds from shoppers</p>
      </div>

      {/* Toolbar */}
      <div className="border-b border-gray-200 p-4 bg-gray-50 flex flex-wrap gap-3 items-center">
        {/* Sort */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Sort:</label>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as 'expiry' | 'created');
              setPage(1);
            }}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="expiry">Expiring Soon</option>
            <option value="created">Recently Added</option>
          </select>
        </div>

        {/* Batch actions */}
        {selectedHolds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-600">{selectedHolds.size} selected</span>
            <button
              onClick={() => handleBatchAction('extend')}
              disabled={batchLoading}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Extend
            </button>
            <button
              onClick={() => handleBatchAction('markSold')}
              disabled={batchLoading}
              className="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              Mark Sold
            </button>
            <button
              onClick={() => handleBatchAction('release')}
              disabled={batchLoading}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              Release
            </button>
          </div>
        )}
      </div>

      {/* Holds List */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading holds...</div>
        ) : holds.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No active holds</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedHolds.size === holds.length && holds.length > 0}
                    onChange={handleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Item</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Shopper</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Expires</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Fraud Score</th>
              </tr>
            </thead>
            <tbody>
              {holds.map((hold) => (
                <tr key={hold.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedHolds.has(hold.id)}
                      onChange={() => handleSelectHold(hold.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-gray-900">{hold.item.title}</div>
                      <div className="text-sm text-gray-600">{hold.item.sale.title}</div>
                      {hold.item.price && (
                        <div className="text-sm font-semibold text-gray-900">${hold.item.price}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-900">{hold.user.name}</div>
                    <div className="text-xs text-gray-600">{hold.user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <HoldTimer expiresAt={hold.expiresAt} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        hold.status === 'PENDING'
                          ? 'bg-yellow-100 text-yellow-800'
                          : hold.status === 'CONFIRMED'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {hold.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {hold.fraudScore ? (
                      <div className="flex items-center gap-1">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            hold.fraudScore > 0.7 ? 'bg-red-500' : 'bg-yellow-500'
                          }`}
                        />
                        <span className="text-sm font-semibold">
                          {(hold.fraudScore * 100).toFixed(0)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="border-t border-gray-200 p-4 flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-3 py-1 text-sm text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default OrganizerHoldsPanel;
