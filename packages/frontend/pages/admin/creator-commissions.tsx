/**
 * Admin: Creator Program commission ledger (2026-09-29).
 *
 * Read the ledger, then settle by hand. "Mark paid" records that YOU paid the creator outside the app
 * (only offered for approved commissions). "Void" cancels an unpaid commission (note required).
 * Nothing on this page, and nothing in the app, pays anyone automatically.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import api from '../../lib/api';
import { formatCents } from '../../lib/creatorProgram';

type State = 'PENDING' | 'APPROVED' | 'PAID' | 'REVERSED';

interface Commission {
  id: string;
  createdAt: string;
  eligibleAt: string;
  state: State;
  commissionCents: number;
  commissionRateBps: number;
  purchaseAmountCents: number;
  platformFeeCents: number;
  payoutStatus: string;
  paidAt: string | null;
  payoutNote: string | null;
  saleTitle: string | null;
  creator: { id: string; name: string; email: string; code: string | null };
}

interface Payload {
  commissions: Commission[];
  pagination: { page: number; limit: number; total: number; pages: number };
  totalsCents: { pending: number; approved: number; paid: number; reversed: number };
}

const BADGE: Record<State, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200',
  APPROVED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  REVERSED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'APPROVED', label: 'Ready to pay' },
  { key: 'PENDING', label: 'In hold' },
  { key: 'PAID', label: 'Paid' },
  { key: 'REVERSED', label: 'Reversed' },
  { key: 'ALL', label: 'All' },
];

const AdminCreatorCommissions = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [filter, setFilter] = useState('APPROVED');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const isAdmin = !!user?.roles?.includes('ADMIN');

  useEffect(() => {
    if (!isLoading && !user) router.push('/login?redirect=/admin/creator-commissions');
    else if (!isLoading && user && !isAdmin) router.push('/access-denied');
  }, [user, isLoading, isAdmin, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/affiliate/commissions', { params: { state: filter, page, limit: 25 } });
      setData(res.data);
    } catch {
      setError('Failed to load commissions.');
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const settle = async (c: Commission, action: 'mark-paid' | 'void') => {
    let note: string | null = '';
    if (action === 'void') {
      note = window.prompt('Why is this commission being voided? (required)');
      if (!note || !note.trim()) return;
    } else {
      const ok = window.confirm(
        `Record that you paid ${c.creator.name} ${formatCents(c.commissionCents)} outside the app?\n\nThis does not send any money.`
      );
      if (!ok) return;
      note = window.prompt('How was it paid? (method or reference, optional)') || '';
    }
    setBusyId(c.id);
    setError('');
    try {
      await api.post(`/admin/affiliate/commissions/${c.id}/${action}`, { note });
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'That action failed.');
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading || !isAdmin) {
    return <div className="container mx-auto px-4 py-8 text-warm-600 dark:text-warm-400">Loading...</div>;
  }

  const t = data?.totalsCents;

  return (
    <>
      <Head>
        <title>Creator commissions | Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-warm-900 dark:text-warm-100 mb-1">Creator commissions</h1>
          <p className="text-warm-600 dark:text-warm-400">
            Payouts are manual. Pay creators yourself, then mark the commission paid here so the ledger matches.{' '}
            <Link href="/admin/creators" className="text-amber-700 dark:text-amber-400 underline">
              Creator list
            </Link>
          </p>
        </div>

        {t && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              ['Ready to pay', t.approved],
              ['In hold', t.pending],
              ['Paid', t.paid],
              ['Reversed', t.reversed],
            ].map(([label, cents]) => (
              <div key={label as string} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-warm-900 dark:text-warm-100">{formatCents(cents as number)}</p>
                <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">{label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                filter === f.key
                  ? 'bg-amber-500 border-amber-500 text-white font-medium'
                  : 'border-warm-300 dark:border-gray-600 text-warm-700 dark:text-warm-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-300 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
          {loading ? (
            <p className="p-6 text-warm-600 dark:text-warm-400">Loading...</p>
          ) : data && data.commissions.length > 0 ? (
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="border-b border-warm-200 dark:border-gray-700 text-left text-warm-600 dark:text-warm-400">
                  <th className="p-3 font-medium">Date</th>
                  <th className="p-3 font-medium">Creator</th>
                  <th className="p-3 font-medium">Sale</th>
                  <th className="p-3 font-medium text-right">Purchase</th>
                  <th className="p-3 font-medium text-right">Commission</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {data.commissions.map((c) => (
                  <tr key={c.id} className="border-b border-warm-100 dark:border-gray-700 align-top">
                    <td className="p-3 text-warm-700 dark:text-warm-300">{new Date(c.createdAt).toLocaleDateString()}</td>
                    <td className="p-3 text-warm-900 dark:text-warm-100">
                      {c.creator.name}
                      <span className="block text-xs text-warm-500 dark:text-warm-400">{c.creator.email}</span>
                      {c.creator.code && <span className="block text-xs font-mono text-warm-500 dark:text-warm-400">{c.creator.code}</span>}
                    </td>
                    <td className="p-3 text-warm-700 dark:text-warm-300">{c.saleTitle ?? 'Sale'}</td>
                    <td className="p-3 text-right text-warm-700 dark:text-warm-300">
                      {formatCents(c.purchaseAmountCents)}
                      <span className="block text-xs text-warm-500 dark:text-warm-400">fee {formatCents(c.platformFeeCents)}</span>
                    </td>
                    <td className="p-3 text-right font-semibold text-warm-900 dark:text-warm-100">
                      {formatCents(c.commissionCents)}
                      <span className="block text-xs font-normal text-warm-500 dark:text-warm-400">
                        {(c.commissionRateBps / 100).toFixed(0)}% of fee
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-block text-xs font-semibold px-2 py-1 rounded ${BADGE[c.state]}`}>{c.state}</span>
                      {c.state === 'PENDING' && (
                        <span className="block text-xs text-warm-500 dark:text-warm-400 mt-1">
                          Approved {new Date(c.eligibleAt).toLocaleDateString()}
                        </span>
                      )}
                      {c.paidAt && (
                        <span className="block text-xs text-warm-500 dark:text-warm-400 mt-1">
                          Paid {new Date(c.paidAt).toLocaleDateString()}
                        </span>
                      )}
                      {c.payoutNote && <span className="block text-xs text-warm-500 dark:text-warm-400 mt-1">{c.payoutNote}</span>}
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      {c.state === 'APPROVED' && (
                        <button
                          onClick={() => settle(c, 'mark-paid')}
                          disabled={busyId === c.id}
                          className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded mr-2 disabled:opacity-60"
                        >
                          Mark paid
                        </button>
                      )}
                      {(c.state === 'APPROVED' || c.state === 'PENDING') && c.payoutStatus === 'UNPAID' && (
                        <button
                          onClick={() => settle(c, 'void')}
                          disabled={busyId === c.id}
                          className="border border-red-500 text-red-600 dark:text-red-400 text-xs px-3 py-1.5 rounded disabled:opacity-60"
                        >
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-8 text-center text-warm-600 dark:text-warm-400">
              {filter === 'ALL' ? 'No commissions yet.' : 'Nothing in this view.'}
            </p>
          )}
        </div>

        {data && data.pagination.pages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-warm-700 dark:text-warm-300">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 border border-warm-300 dark:border-gray-600 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span>
              Page {data.pagination.page} of {data.pagination.pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(data.pagination.pages, p + 1))}
              disabled={page >= data.pagination.pages}
              className="px-3 py-1.5 border border-warm-300 dark:border-gray-600 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default AdminCreatorCommissions;
