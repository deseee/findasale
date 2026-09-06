/**
 * Connect Bank-Fingerprint Fraud Flag Queue — S1198 fraud-ring incident follow-up
 *
 * Cross-account admin view of every ConnectBankFingerprint row flagged by
 * connectAccountGuard.ts (recordAndCheckBankFingerprints, called from stripeController.ts's
 * account.updated webhook handler) when two different Stripe Connect accounts
 * (Organizer/Consignor/VendorBooth) are found to share the identical bank-account
 * fingerprint -- the signal that caught the 2026-09-06 synthetic-identity fraud ring.
 * The backend API already existed (adminController.ts listConnectBankFingerprintFlags /
 * reviewConnectBankFingerprintFlag) -- this page is the first UI to call it. Mirrors
 * /admin/fraud-signals.tsx's review-queue convention (PENDING | DISMISSED | CONFIRMED).
 *
 * Reviewing a flag here does NOT itself suspend an account or block payouts -- it only
 * records the outcome. DISMISSED clears payoutsFlaggedForReview on that owner row (payout
 * hold lifts); CONFIRMED and PENDING leave it set. Never displays the raw bank-account
 * fingerprint or full account/routing numbers -- only last4 / bank name / routing last4,
 * matching the backend's own "never put raw fingerprint or bank numbers in admin-facing
 * text" posture (connectAccountGuard.ts).
 *
 * Route: /admin/connect-bank-fingerprints
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';

type ReviewOutcome = 'PENDING' | 'DISMISSED' | 'CONFIRMED';
type OwnerType = 'ORGANIZER' | 'CONSIGNOR' | 'VENDOR_BOOTH';

interface ConnectBankFingerprintRecord {
  id: string;
  stripeAccountId: string;
  last4: string | null;
  bankName: string | null;
  routingLast4: string | null;
  ownerType: OwnerType;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  flagged: boolean;
  flagReason: string | null;
  reviewOutcome: ReviewOutcome;
  reviewedByAdminId: string | null;
  reviewedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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

const ownerTypeLabel: Record<OwnerType, string> = {
  ORGANIZER: 'Organizer',
  CONSIGNOR: 'Consignor',
  VENDOR_BOOTH: 'Vendor Booth',
};

const AdminConnectBankFingerprints = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [flags, setFlags] = useState<ConnectBankFingerprintRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  // Default to PENDING -- unlike /admin/fraud-signals (default CONFIRMED, already-blocked
  // events), a bank-fingerprint match is never auto-blocked, so PENDING is the actionable
  // queue admin actually needs to work through.
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | ReviewOutcome>('PENDING');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login?redirect=/admin/connect-bank-fingerprints');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!isLoading && user && !user.roles?.includes('ADMIN')) {
      router.push('/access-denied');
    }
  }, [user, isLoading, router]);

  const fetchFlags = async (p = 1) => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      params.append('page', String(p));
      params.append('limit', '50');
      if (outcomeFilter !== 'ALL') params.append('reviewOutcome', outcomeFilter);
      const res = await api.get(`/admin/connect-bank-fingerprints?${params.toString()}`);
      setFlags(res.data.flags || []);
      setPagination(res.data.pagination || null);
      setPage(p);
    } catch (err) {
      console.error('Error fetching Connect bank-fingerprint flags:', err);
      setError('Failed to load Connect bank-fingerprint flags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.roles?.includes('ADMIN')) {
      fetchFlags(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, outcomeFilter]);

  const handleReview = async (id: string, reviewOutcome: ReviewOutcome) => {
    try {
      setActionLoading(id);
      const notes = notesDraft[id];
      await api.patch(`/admin/connect-bank-fingerprints/${id}`, {
        reviewOutcome,
        ...(notes ? { notes } : {}),
      });
      // Refresh in place rather than optimistic-remove -- an admin switching a PENDING
      // row to DISMISSED should see it drop out of the current PENDING-filtered view
      // immediately, same as a real re-query would show.
      await fetchFlags(page);
    } catch (err) {
      console.error('Error updating Connect bank-fingerprint flag:', err);
      setError('Failed to update Connect bank-fingerprint flag');
    } finally {
      setActionLoading(null);
    }
  };

  if (isLoading || (loading && flags.length === 0)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center text-warm-600 dark:text-warm-400">Loading Connect bank-fingerprint queue...</div>
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
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-2">Connect Bank-Fingerprint Flags</h1>
          <p className="text-warm-600 dark:text-warm-400">
            Shared-bank-account collisions across Organizer / Consignor / Vendor Booth Stripe Connect accounts (S1198 fraud-ring detection).
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
            <option value="CONFIRMED">Confirmed (real collusion)</option>
            <option value="DISMISSED">Dismissed (reviewed, legitimate)</option>
            <option value="ALL">All</option>
          </select>
        </div>
        {pagination && (
          <div className="text-sm text-warm-500 dark:text-warm-400 ml-auto">
            {pagination.total} flag{pagination.total !== 1 ? 's' : ''} matching this filter
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {flags.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-12 text-center">
          <p className="text-warm-600 dark:text-warm-400 text-lg mb-2">No flags match this filter</p>
          <p className="text-warm-500 dark:text-warm-400">All clear ✅</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-warm-200 dark:border-gray-700 bg-warm-50 dark:bg-gray-700">
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Owner</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Stripe Account</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Bank (last4)</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Flag Reason</th>
                  <th className="text-left px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Notes</th>
                  <th className="text-right px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Flagged</th>
                  <th className="text-center px-4 py-3 font-medium text-warm-900 dark:text-warm-100">Actions</th>
                </tr>
              </thead>
              <tbody>
                {flags.map(record => (
                  <tr key={record.id} className="border-b border-warm-100 dark:border-gray-700 hover:bg-warm-50 dark:hover:bg-gray-700 align-top">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${outcomeBadge[record.reviewOutcome || 'PENDING']}`}>
                        {record.reviewOutcome || 'PENDING'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100">
                      <div className="text-xs font-mono text-warm-500 dark:text-warm-400">{ownerTypeLabel[record.ownerType]}</div>
                      <div>{record.ownerName || '(no name)'}</div>
                      <div className="text-xs text-warm-500 dark:text-warm-400">{record.ownerEmail || '(no email)'}</div>
                    </td>
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100 font-mono text-xs">{record.stripeAccountId}</td>
                    <td className="px-4 py-3 text-warm-900 dark:text-warm-100 text-xs">
                      <div>{record.bankName || '(unknown bank)'}</div>
                      <div className="text-warm-500 dark:text-warm-400">
                        {record.last4 ? `••••${record.last4}` : '—'}
                        {record.routingLast4 ? ` / rt ••${record.routingLast4}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-warm-600 dark:text-warm-400 text-xs max-w-xs">{record.flagReason || '—'}</td>
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
                      {new Date(record.createdAt).toLocaleDateString()} {new Date(record.createdAt).toLocaleTimeString()}
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
                  onClick={() => fetchFlags(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1 rounded border border-warm-300 dark:border-gray-600 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() => fetchFlags(page + 1)}
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

export default AdminConnectBankFingerprints;
