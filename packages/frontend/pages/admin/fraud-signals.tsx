/**
 * Global Fraud Signal Queue — S1072 collusion/wash-trade detection (FraudSignal model)
 *
 * Cross-sale admin view of every SELF_DEALING / SHARED_DEVICE_FP / SHARED_CARD_FP signal
 * recorded by checkoutGuard.ts (recordConfirmedSignal — hard-blocked at checkout) and
 * terminalController.ts (recordSuspectedSignal — log-only, cash/terminal sales with no
 * verifiable buyer identity to hard-block against). The backend API already existed
 * (adminController.ts listAllFraudSignals / reviewFraudSignalAdmin) — this page is the
 * first UI to call it. See claude_docs/feature-notes/ADR-fraud-signal-alerting-dashboard.md.
 *
 * Default filter is CONFIRMED — the highest-confidence, already-blocked collusion attempts,
 * the same population that now also fires a Sentry alert at write-time. PENDING (log-only,
 * cash/terminal) and DISMISSED (reviewed false positives) are one click away but not the
 * default, to keep this dashboard from becoming noisy enough that nobody checks it.
 *
 * Route: /admin/fraud-signals
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

type ReviewOutcome = 'PENDING' | 'DISMISSED' | 'CONFIRMED';
type SignalType = 'SELF_DEALING' | 'SHARED_DEVICE_FP' | 'SHARED_CARD_FP';

interface FraudSignalRecord {
  id: string;
  userId: string;
  user: { id: string; email: string; name: string | null } | null;
  itemId: string | null;
  item: { id: string; title: string } | null;
  saleId: string;
  sale: { id: string; title: string } | null;
  signalType: SignalType;
  confidenceScore: number;
  detectedAt: string;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
  reviewOutcome: ReviewOutcome | null;
  notes: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const outcomeBadge: Record<string, string> = {
  CONFIRMED: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100',
  PENDING: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-100',
  DISMISSED: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
};

const AdminFraudSignals = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [signals, setSignals] = useState<FraudSignalRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<'CONFIRMED' | ReviewOutcome | 'ALL'>('CONFIRMED');
  const [signalTypeFilter, setSignalTypeFilter] = useState<'ALL' | SignalType>('ALL');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login?redirect=/admin/fraud-signals');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!isLoading && user && !user.roles?.includes('ADMIN')) {
      router.push('/access-denied');
    }
  }, [user, isLoading, router]);

  const fetchSignals = async (p = 1) => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      params.append('page', String(p));
      params.append('limit', '50');
      if (outcomeFilter !== 'ALL') params.append('reviewOutcome', outcomeFilter);
      const res = await api.get(`/admin/fraud-signals?${params.toString()}`);
      let rows: FraudSignalRecord[] = res.data.signals || [];
      if (signalTypeFilter !== 'ALL') {
        rows = rows.filter(r => r.signalType === signalTypeFilter);
      }
      setSignals(rows);
      setPagination(res.data.pagination || null);
      setPage(p);
    } catch (err) {
      console.error('Error fetching fraud signals:', err);
      setError('Failed to load fraud signals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchSignals(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, outcomeFilter, signalTypeFilter]);

  const handleReview = async (id: string, reviewOutcome: ReviewOutcome) => {
    try {
      setActionLoading(id);
      const notes = notesDraft[id];
      await api.patch(`/admin/fraud-signals/${id}`, {
        reviewOutcome,
        ...(notes ? { notes } : {}),
      });
      // Refresh in place rather than optimistic-remove — an admin switching a
      // CONFIRMED row to DISMISSED should see it drop out of the current
      // CONFIRMED-filtered view immediately, same as a real re-query would show.
      await fetchSignals(page);
    } catch (err) {
      console.error('Error updating fraud signal:', err);
      setError('Failed to update fraud signal');
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading || (loading && signals.length === 0)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading fraud signal queue...</div>
      </div>
    );
  }

  if (!user || !user.roles?.includes('ADMIN')) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Fraud Signals</h1>
          <p className="text-warm-600 dark:text-warm-400">
            Collusion / wash-trade detection (self-dealing, shared device, shared card) across every sale.
          </p>
        </div>
        <Link href="/admin" className="text-warm-600 dark:text-warm-400 hover:text-warm-900 dark:hover:text-warm-100 underline">
          Back to Dashboard
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 items-end bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <div>
          <label className="block text-xs font-medium text-warm-600 dark:text-warm-400 mb-1">Review Status</label>
          <select
            value={outcomeFilter}
            onChange={e => setOutcomeFilter(e.target.value as any)}
            className="border border-warm-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
          >
            <option value="CONFIRMED">Confirmed (blocked collusion)</option>
            <option value="PENDING">Pending (log-only, needs review)</option>
            <option value="DISMISSED">Dismissed (reviewed, false positive)</option>
            <option value="ALL">All</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-warm-600 dark:text-warm-400 mb-1">Signal Type</label>
          <select
            value={signalTypeFilter}
            onChange={e => setSignalTypeFilter(e.target.value as any)}
            className="border border-warm-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
          >
            <option value="ALL">All types</option>
            <option value="SELF_DEALING">Self-dealing</option>
            <option value="SHARED_DEVICE_FP">Shared device</option>
            <option value="SHARED_CARD_FP">Shared card</option>
          </select>
        </div>
        {pagination && (
          <div className="text-sm text-warm-500 dark:text-warm-400 ml-auto">
            {pagination.total} signal{pagination.total !== 1 ? 's' : ''} matching this filter
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {signals.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-12 text-center">
          <p className="text-warm-600 dark:text-warm-400 text-lg mb-2">No fraud signals match this filter</p>
          <p className="text-warm-500 dark:text-warm-400">All clear ✅</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-700">
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Signal</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">User</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Sale / Item</th>
                  <th className="text-right px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Confidence</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Notes</th>
                  <th className="text-right px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Detected</th>
                  <th className="text-center px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Actions</th>
                </tr>
              </thead>
              <tbody>
                {signals.map(record => (
                  <tr key={record.id} className="border-b border-warm-100 dark:border-gray-700 hover:bg-warm-50 dark:hover:bg-gray-700 align-top">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${outcomeBadge[record.reviewOutcome || 'PENDING']}`}>
                        {record.reviewOutcome || 'PENDING'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100 font-mono text-xs">{record.signalType}</td>
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">
                      {record.user ? (
                        <>
                          <div>{record.user.name || '(no name)'}</div>
                          <div className="text-xs text-warm-500 dark:text-warm-400">{record.user.email}</div>
                        </>
                      ) : (
                        <span className="text-warm-400">(deleted user)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">
                      {record.sale ? (
                        <a href={`/sale/${record.sale.id}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                          {record.sale.title}
                        </a>
                      ) : (
                        <span className="text-warm-400">(deleted sale)</span>
                      )}
                      {record.item && (
                        <div className="text-xs text-warm-500 dark:text-warm-400">
                          Item: <a href={`/item/${record.item.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{record.item.title}</a>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-warm-900 dark:text-warm-100 font-medium">{record.confidenceScore}</td>
                    <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs max-w-xs">
                      <div className="mb-1">{record.notes || '—'}</div>
                      <input
                        type="text"
                        placeholder="Add review note..."
                        value={notesDraft[record.id] ?? ''}
                        onChange={e => setNotesDraft(prev => ({ ...prev, [record.id]: e.target.value }))}
                        className="w-full border border-warm-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-warm-900 dark:text-warm-100"
                      />
                    </td>
                    <td className="px-4 py-3 text-right text-warm-500 dark:text-warm-400 text-xs whitespace-nowrap">
                      {new Date(record.detectedAt).toLocaleDateString()} {new Date(record.detectedAt).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col gap-1 items-stretch">
                        <button
                          onClick={() => handleReview(record.id, 'CONFIRMED')}
                          disabled={actionLoading === record.id || record.reviewOutcome === 'CONFIRMED'}
                          className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-xs px-2 py-1 rounded"
                        >
                          {actionLoading === record.id ? '...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => handleReview(record.id, 'DISMISSED')}
                          disabled={actionLoading === record.id || record.reviewOutcome === 'DISMISSED'}
                          className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 text-white text-xs px-2 py-1 rounded"
                        >
                          {actionLoading === record.id ? '...' : 'Dismiss'}
                        </button>
                        <button
                          onClick={() => handleReview(record.id, 'PENDING')}
                          disabled={actionLoading === record.id || record.reviewOutcome === 'PENDING'}
                          className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-xs px-2 py-1 rounded"
                        >
                          {actionLoading === record.id ? '...' : 'Reopen'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination && pagination.pages > 1 && (
            <div className="px-4 py-3 bg-warm-50 dark:bg-gray-700 border-t border-warm-200 dark:border-gray-700 text-sm text-warm-600 dark:text-warm-400 flex items-center justify-between">
              <span>Page {pagination.page} of {pagination.pages} ({pagination.total} total)</span>
              <div className="space-x-2">
                <button
                  onClick={() => fetchSignals(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded border border-warm-300 dark:border-gray-600 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() => fetchSignals(page + 1)}
                  disabled={page >= pagination.pages}
                  className="px-3 py-1 rounded border border-warm-300 dark:border-gray-600 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminFraudSignals;
