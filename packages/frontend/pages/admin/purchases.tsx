import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

interface AdminPurchase {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  source: string;
  guestName: string | null;
  buyerEmail: string | null;
  stripePaymentIntentId: string | null;
  chargeType: string | null;
  refundedAt: string | null;
  refundedAmount: number | null;
  user: { id: string; email: string; name: string } | null;
  item: { id: string; title: string } | null;
  sale: { id: string; title: string; organizerId: string; organizer: { businessName: string } | null } | null;
}

interface RefundResult {
  purchaseId: string;
  success: boolean;
  refundedAmount?: number;
  error?: string;
}

const STATUS_OPTIONS = ['PAID', 'PENDING', 'REFUNDED', 'REFUNDING', 'FAILED', 'DISPUTED', 'DISPUTE_LOST'];
const PAGE_LIMIT = 25;

const statusClass = (status: string): string => {
  if (status === 'PAID') return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300';
  if (status === 'REFUNDED' || status === 'REFUNDING') return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300';
  if (status === 'DISPUTED' || status === 'DISPUTE_LOST' || status === 'FAILED') return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
  return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300';
};

const AdminPurchases = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [purchases, setPurchases] = useState<AdminPurchase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters (draft values live in these; applied on Search submit)
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [saleId, setSaleId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refunding, setRefunding] = useState(false);
  const [refundResults, setRefundResults] = useState<RefundResult[] | null>(null);
  const [confirmBulkRefund, setConfirmBulkRefund] = useState(false);
  const [singleRefundTarget, setSingleRefundTarget] = useState<AdminPurchase | null>(null);
  // Bug fix (2026-08-30): refunds used to always be tagged 'fraudulent' in Stripe with no
  // way to opt out, which auto-blocklists the buyer's email + card on Stripe for this
  // organizer. Default is now a normal, non-blocking refund; fraud is an explicit,
  // informed opt-in via these checkboxes.
  const [singleRefundMarkFraud, setSingleRefundMarkFraud] = useState(false);
  const [bulkRefundMarkFraud, setBulkRefundMarkFraud] = useState(false);
  const [singleRefundError, setSingleRefundError] = useState('');
  const [singleRefundLoading, setSingleRefundLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && (!user || !user.roles?.includes('ADMIN'))) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  const fetchPurchases = async (p = 1) => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      params.append('page', p.toString());
      params.append('limit', PAGE_LIMIT.toString());
      if (statusFilter) params.append('status', statusFilter);
      if (search) params.append('search', search);
      if (saleId) params.append('saleId', saleId);
      if (dateFrom) params.append('dateFrom', dateFrom);
      if (dateTo) params.append('dateTo', dateTo);

      const res = await api.get(`/admin/purchases?${params.toString()}`);
      setPurchases(res.data.purchases);
      setTotal(res.data.total);
      setPage(p);
      setSelected(new Set());
    } catch (err) {
      console.error('Error fetching purchases:', err);
      setError('Failed to load purchases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchPurchases(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setRefundResults(null);
    fetchPurchases(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buyerLabel = (p: AdminPurchase): { primary: string; secondary: string } => {
    if (p.user) return { primary: p.user.name || p.user.email, secondary: p.user.email };
    if (p.guestName || p.buyerEmail) return { primary: p.guestName || 'Guest', secondary: p.buyerEmail || '' };
    return { primary: 'Unknown', secondary: '' };
  };

  const runBulkRefund = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setRefunding(true);
    setRefundResults(null);
    try {
      const res = await api.post('/admin/purchases/bulk-refund', { purchaseIds: ids, reason: bulkRefundMarkFraud ? 'fraudulent' : 'requested_by_customer' });
      const results: RefundResult[] = res.data.results;
      setRefundResults(results);
      // Reflect successful refunds locally without a full refetch
      const succeededIds = new Set(results.filter(r => r.success).map(r => r.purchaseId));
      setPurchases(prev => prev.map(p => succeededIds.has(p.id) ? { ...p, status: 'REFUNDED' } : p));
      setSelected(new Set());
      setBulkRefundMarkFraud(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to process bulk refund');
    } finally {
      setRefunding(false);
      setConfirmBulkRefund(false);
    }
  };

  const runSingleRefund = async () => {
    const target = singleRefundTarget;
    if (!target) return;
    setSingleRefundLoading(true);
    setSingleRefundError('');
    try {
      const res = await api.post('/admin/purchases/bulk-refund', { purchaseIds: [target.id], reason: singleRefundMarkFraud ? 'fraudulent' : 'requested_by_customer' });
      const results: RefundResult[] = res.data.results;
      const result = results[0];
      if (result?.success) {
        setPurchases(prev => prev.map(p => p.id === target.id ? { ...p, status: 'REFUNDED' } : p));
        setSingleRefundTarget(null);
        setSingleRefundMarkFraud(false);
      } else {
        setSingleRefundError(result?.error || 'Failed to issue refund');
      }
    } catch (err: any) {
      setSingleRefundError(err?.response?.data?.message || 'Failed to issue refund');
    } finally {
      setSingleRefundLoading(false);
    }
  };

  if (isLoading || (loading && purchases.length === 0)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading purchases...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <>
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <Link href="/admin" className="text-amber-600 hover:underline text-sm mb-2 inline-block">
            ← Back to admin
          </Link>
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Purchases</h1>
          <p className="text-warm-600 dark:text-warm-400">
            Search all purchases — authenticated and guest checkout — and issue refunds individually or in bulk.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-warm-600 dark:text-warm-400 mb-1">Search</label>
            <input
              type="text"
              placeholder="Buyer email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-warm-600 dark:text-warm-400 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-warm-600 dark:text-warm-400 mb-1">Sale ID</label>
            <input
              type="text"
              placeholder="Sale ID..."
              value={saleId}
              onChange={(e) => setSaleId(e.target.value)}
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-warm-600 dark:text-warm-400 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-warm-600 dark:text-warm-400 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 dark:bg-gray-800 dark:text-warm-100 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-600"
            />
          </div>

          <div className="lg:col-span-6">
            <button
              type="submit"
              className="px-6 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition"
            >
              Search
            </button>
          </div>
        </form>
      </div>

      {/* Bulk action bar */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-warm-600 dark:text-warm-400">
          {total} purchase{total === 1 ? '' : 's'} found
        </p>
        <button
          onClick={() => setConfirmBulkRefund(true)}
          disabled={selected.size === 0 || refunding}
          className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          Refund Selected ({selected.size})
        </button>
      </div>

      {/* Bulk refund results summary */}
      {refundResults && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100 mb-2">Refund results</h3>
          <ul className="space-y-1">
            {refundResults.map(r => (
              <li key={r.purchaseId} className="text-xs flex items-center gap-2">
                <span className={r.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                  {r.success ? '✓' : '✗'}
                </span>
                <span className="font-mono text-warm-500 dark:text-warm-400">{r.purchaseId}</span>
                <span className="text-warm-700 dark:text-warm-300">
                  {r.success ? `Refunded $${(r.refundedAmount ?? 0).toFixed(2)}` : (r.error || 'Failed')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Purchases Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-warm-50 dark:bg-gray-900 border-b border-warm-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-3 text-left">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Buyer</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Item</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Sale</th>
                <th className="px-6 py-3 text-right text-sm font-medium text-warm-900 dark:text-warm-100">Amount</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-warm-900 dark:text-warm-100">Date</th>
                <th className="px-6 py-3 text-center text-sm font-medium text-warm-900 dark:text-warm-100">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-warm-200">
              {purchases.map(p => {
                const buyer = buyerLabel(p);
                return (
                  <tr key={p.id} className="hover:bg-warm-50 dark:hover:bg-gray-700 dark:bg-gray-900">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelected(p.id)}
                        aria-label={`Select purchase ${p.id}`}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-900 dark:text-warm-100">
                      <div className="font-medium">{buyer.primary}</div>
                      {buyer.secondary && (
                        <div className="text-xs text-warm-500 dark:text-warm-400">{buyer.secondary}</div>
                      )}
                      {!p.user && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          GUEST
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                      {p.item ? (
                        <Link href={`/items/${p.item.id}`} className="text-amber-600 hover:underline">
                          {p.item.title}
                        </Link>
                      ) : (
                        <span className="text-warm-400 dark:text-warm-500">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                      {p.sale ? (
                        <div>
                          <Link href={`/sales/${p.sale.id}`} className="text-amber-600 hover:underline">
                            {p.sale.title}
                          </Link>
                          {p.sale.organizer && (
                            <div className="text-xs text-warm-500 dark:text-warm-400">{p.sale.organizer.businessName}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-warm-400 dark:text-warm-500">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-warm-900 dark:text-warm-100 font-medium">
                      ${p.amount.toFixed(2)}
                      {p.refundedAmount != null && p.status === 'REFUNDED' && (
                        <div className="text-xs text-orange-500 dark:text-orange-400">
                          refunded ${p.refundedAmount.toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      <span className={`inline-block px-3 py-1 rounded text-xs font-medium ${statusClass(p.status)}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-warm-600 dark:text-warm-400">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      {p.status === 'PAID' && (
                        <button
                          onClick={() => { setSingleRefundTarget(p); setSingleRefundError(''); }}
                          className="px-3 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                        >
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {purchases.length === 0 && (
          <div className="text-center py-8">
            <p className="text-warm-600 dark:text-gray-400">No purchases match your search or filters.</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2 flex-wrap">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => fetchPurchases(p)}
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

    {/* Single Refund Confirmation Modal */}
    {singleRefundTarget && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
          <div className="flex items-center justify-between p-5 border-b border-warm-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-warm-900 dark:text-warm-100">Confirm Refund</h2>
            <button
              onClick={() => { if (!singleRefundLoading) { setSingleRefundTarget(null); setSingleRefundError(''); } }}
              className="text-warm-400 hover:text-warm-600 dark:text-warm-500 dark:hover:text-warm-300 text-xl leading-none"
            >
              ×
            </button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-warm-700 dark:text-warm-300">
              Refund <span className="font-semibold">${singleRefundTarget.amount.toFixed(2)}</span> to{' '}
              {singleRefundTarget.user?.email || singleRefundTarget.buyerEmail || 'this buyer'}? This reverses
              the Stripe charge and cannot be undone.
            </p>
            <label className="flex items-start gap-2 text-sm text-warm-700 dark:text-warm-300 cursor-pointer">
              <input
                type="checkbox"
                checked={singleRefundMarkFraud}
                onChange={e => setSingleRefundMarkFraud(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                This is fraud — mark the refund as fraudulent in Stripe. <strong>This auto-blocks the
                buyer&apos;s email and card from ever paying this organizer again.</strong> Leave unchecked
                for a normal refund (test purchase, buyer request, mistake, etc.).
              </span>
            </label>
            {singleRefundError && (
              <p className="text-sm text-red-600 dark:text-red-400">{singleRefundError}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 px-5 pb-5">
            <button
              onClick={() => { if (!singleRefundLoading) { setSingleRefundTarget(null); setSingleRefundError(''); setSingleRefundMarkFraud(false); } }}
              disabled={singleRefundLoading}
              className="px-4 py-2 text-sm text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={singleRefundLoading}
              onClick={runSingleRefund}
              className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              {singleRefundLoading ? 'Refunding…' : (singleRefundMarkFraud ? 'Refund & Block Buyer' : 'Refund')}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Bulk Refund Confirmation Modal */}
    {confirmBulkRefund && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
          <div className="flex items-center justify-between p-5 border-b border-warm-200 dark:border-gray-700">
            <h2 className="text-base font-semibold text-warm-900 dark:text-warm-100">Confirm Bulk Refund</h2>
            <button
              onClick={() => { if (!refunding) setConfirmBulkRefund(false); }}
              className="text-warm-400 hover:text-warm-600 dark:text-warm-500 dark:hover:text-warm-300 text-xl leading-none"
            >
              ×
            </button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-warm-700 dark:text-warm-300">
              Refund <span className="font-semibold">{selected.size}</span> selected purchase{selected.size === 1 ? '' : 's'}?
              Each reverses its Stripe charge in full and cannot be undone.
            </p>
            <label className="flex items-start gap-2 text-sm text-warm-700 dark:text-warm-300 cursor-pointer">
              <input
                type="checkbox"
                checked={bulkRefundMarkFraud}
                onChange={e => setBulkRefundMarkFraud(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                This is a fraud incident — mark all {selected.size} refund{selected.size === 1 ? '' : 's'} as
                fraudulent in Stripe. <strong>This auto-blocks each buyer&apos;s email and card from ever
                paying this organizer again.</strong> Leave unchecked for routine refunds.
              </span>
            </label>
          </div>
          <div className="flex justify-end gap-3 px-5 pb-5">
            <button
              onClick={() => { if (!refunding) { setConfirmBulkRefund(false); setBulkRefundMarkFraud(false); } }}
              disabled={refunding}
              className="px-4 py-2 text-sm text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={refunding}
              onClick={runBulkRefund}
              className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              {refunding ? 'Refunding…' : (bulkRefundMarkFraud ? 'Refund All & Block Buyers' : 'Refund All')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default AdminPurchases;
