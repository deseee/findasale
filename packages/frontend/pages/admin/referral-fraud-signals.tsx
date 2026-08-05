/**
 * Referral Fraud Signal Queue — D-XP-004 Phase 5 (ReferralFraudSignal model)
 *
 * Admin view of referral-program fraud signals (DEVICE_ABUSE, IP_VELOCITY, ACCOUNT_AGE,
 * SELF_REFERRAL) written by referralFraudService.ts whenever a referral scores > 30. The
 * backend API already existed (referralController.ts listFraudSignals / reviewFraudSignal,
 * wired in routes/admin.ts) — this page is the first UI to call it. Same "recorded but never
 * surfaced" gap as the global FraudSignal queue (see ADR-fraud-signal-alerting-dashboard.md),
 * found while auditing that one for the sibling-gap check.
 *
 * Deliberately distinct from /admin/fraud-signals: different model, different outcome enum
 * (PENDING/APPROVED/REJECTED, not PENDING/DISMISSED/CONFIRMED), different review verbs
 * (Approve/Reject a referral reward, not Confirm/Dismiss a checkout block). No Sentry alert
 * is wired here — see ADR "Explicitly not building" for why.
 *
 * Route: /admin/referral-fraud-signals
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

type ReferralOutcome = 'PENDING' | 'APPROVED' | 'REJECTED';
type ReferralSignalType = 'DEVICE_ABUSE' | 'IP_VELOCITY' | 'ACCOUNT_AGE' | 'SELF_REFERRAL';

interface ReferralFraudSignalRecord {
  id: string;
  referralRewardId: string;
  referrerId: string;
  referredUserId: string;
  signalType: ReferralSignalType;
  confidenceScore: number;
  flags: string[];
  reviewOutcome: ReferralOutcome;
  reviewedByAdminId: string | null;
  reviewedAt: string | null;
  notes: string | null;
  createdAt: string;
  referralReward: {
    id: string;
    referrerId: string;
    referredUserId: string;
    fraudReviewStatus: string;
    deviceFraudScore: number | null;
    ipFraudScore: number | null;
  } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const outcomeBadge: Record<string, string> = {
  APPROVED: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100',
  PENDING: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-100',
  REJECTED: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100',
};

const AdminReferralFraudSignals = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [signals, setSignals] = useState<ReferralFraudSignalRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [outcomeFilter, setOutcomeFilter] = useState<ReferralOutcome | 'ALL'>('PENDING');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login?redirect=/admin/referral-fraud-signals');
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
      params.append('outcome', outcomeFilter);
      const res = await api.get(`/admin/referral-fraud-signals?${params.toString()}`);
      setSignals(res.data.signals || []);
      setPagination(res.data.pagination || null);
      setPage(p);
    } catch (err) {
      console.error('Error fetching referral fraud signals:', err);
      setError('Failed to load referral fraud signals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchSignals(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, outcomeFilter]);

  const handleReview = async (signalId: string, outcome: 'APPROVED' | 'REJECTED') => {
    try {
      setActionLoading(signalId);
      const notes = notesDraft[signalId];
      await api.patch(`/admin/referral-fraud-signals/${signalId}/review`, {
        outcome,
        ...(notes ? { notes } : {}),
      });
      await fetchSignals(page);
    } catch (err) {
      console.error('Error reviewing referral fraud signal:', err);
      setError('Failed to update referral fraud signal');
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading || (loading && signals.length === 0)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading referral fraud queue...</div>
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
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Referral Fraud Signals</h1>
          <p className="text-warm-600 dark:text-warm-400">
            Device abuse, IP velocity, account age, and self-referral signals on the XP referral program.
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
            <option value="PENDING">Pending (needs review)</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="ALL">All</option>
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
          <p className="text-warm-600 dark:text-warm-400 text-lg mb-2">No referral fraud signals match this filter</p>
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
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Referrer</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Referred User</th>
                  <th className="text-right px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Confidence</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Flags / Notes</th>
                  <th className="text-right px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Created</th>
                  <th className="text-center px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Actions</th>
                </tr>
              </thead>
              <tbody>
                {signals.map(record => (
                  <tr key={record.id} className="border-b border-warm-100 dark:border-gray-700 hover:bg-warm-50 dark:hover:bg-gray-700 align-top">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${outcomeBadge[record.reviewOutcome]}`}>
                        {record.reviewOutcome}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100 font-mono text-xs">{record.signalType}</td>
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100 font-mono text-xs">{record.referrerId}</td>
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100 font-mono text-xs">{record.referredUserId}</td>
                    <td className="px-4 py-3 text-right text-warm-900 dark:text-warm-100 font-medium">{record.confidenceScore}</td>
                    <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs max-w-xs">
                      {record.flags?.length > 0 && (
                        <div className="mb-1">{record.flags.join(', ')}</div>
                      )}
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
                      {new Date(record.createdAt).toLocaleDateString()} {new Date(record.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col gap-1 items-stretch">
                        <button
                          onClick={() => handleReview(record.id, 'APPROVED')}
                          disabled={actionLoading === record.id || record.reviewOutcome === 'APPROVED'}
                          className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white text-xs px-2 py-1 rounded"
                        >
                          {actionLoading === record.id ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReview(record.id, 'REJECTED')}
                          disabled={actionLoading === record.id || record.reviewOutcome === 'REJECTED'}
                          className="bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white text-xs px-2 py-1 rounded"
                        >
                          {actionLoading === record.id ? '...' : 'Reject'}
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

export default AdminReferralFraudSignals;
