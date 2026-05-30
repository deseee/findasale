/**
 * Multi-Consignor Estate Settlement — Feature #239 (Phase 1, test mode)
 *
 * TEAMS-tier page. Shows the per-consignor split for a sale (gross / % / net),
 * lets the organizer create a DRAFT settlement batch and Approve it.
 *
 * Live money movement is gated server-side behind STRIPE_CONNECT_LIVE_TRANSFERS
 * (defaults OFF). With the flag OFF, Approve simulates transfers — no money moves.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import TierGate from '../../../components/TierGate';
import { DollarSign, CheckCircle2, AlertTriangle } from 'lucide-react';

interface PreviewRow {
  consignorId: string;
  name: string;
  email: string | null;
  commissionRate: string;
  itemCount: number;
  gross: string;
  net: string;
  stripeOnboarded: boolean;
  payoutMethod: 'ACH' | 'MANUAL_CASH_CHECK';
}

interface Preview {
  saleId: string;
  saleTitle: string;
  saleStatus: string;
  liveTransfersEnabled: boolean;
  existingBatch: { id: string; status: string } | null;
  totalGross: string;
  totalConsignorPayouts: string;
  consignors: PreviewRow[];
}

interface BatchPayout {
  id: string;
  netPayout: string | number;
  status: string;
  method: string | null;
  failureReason: string | null;
  consignor?: { name: string; email: string | null; stripeOnboarded: boolean };
}

interface Batch {
  id: string;
  status: string;
  totalGross: string | number;
  totalConsignorPayouts: string | number;
  liveTransfersEnabled?: boolean;
  message?: string;
  payouts: BatchPayout[];
}

const fmt = (v: string | number) => `$${Number(v).toFixed(2)}`;

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    DRAFT: 'bg-warm-100 text-warm-700 dark:bg-gray-700 dark:text-warm-300',
    APPROVED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    PROCESSING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    SIMULATED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    PENDING: 'bg-warm-100 text-warm-700 dark:bg-gray-700 dark:text-warm-300',
    PARTIAL: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    MANUAL_CASH_CHECK: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  };
  return map[status] || 'bg-warm-100 text-warm-700 dark:bg-gray-700 dark:text-warm-300';
};

const ConsignorSettlementPage: React.FC = () => {
  const router = useRouter();
  const { saleId } = router.query;
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState(false);

  const loadPreview = useCallback(async () => {
    if (!saleId || typeof saleId !== 'string') return;
    try {
      setLoading(true);
      const res = await api.get(`/consignor-settlements/preview/${saleId}`);
      setPreview(res.data);
      if (res.data.existingBatch?.id) {
        const b = await api.get(`/consignor-settlements/${res.data.existingBatch.id}`);
        setBatch(b.data);
      } else {
        setBatch(null);
      }
    } catch (error: any) {
      console.error('Error loading settlement preview:', error);
      showToast(error.response?.data?.error || 'Failed to load settlement', 'error');
    } finally {
      setLoading(false);
    }
  }, [saleId, showToast]);

  useEffect(() => {
    if (user && user.roles?.includes('ORGANIZER')) {
      loadPreview();
    }
  }, [user, loadPreview]);

  const handleCreateBatch = async () => {
    if (!saleId || typeof saleId !== 'string') return;
    setCreating(true);
    try {
      const res = await api.post('/consignor-settlements', { saleId });
      setBatch(res.data);
      showToast('Settlement batch created (draft)', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to create batch', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleApprove = async () => {
    if (!batch) return;
    setApproving(true);
    try {
      const res = await api.post(`/consignor-settlements/${batch.id}/approve`);
      setBatch(res.data);
      showToast(res.data.message || 'Settlement approved', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Failed to approve settlement', 'error');
    } finally {
      setApproving(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-warm-600 dark:text-warm-400">Loading settlement...</p>
      </div>
    );
  }

  const rows = preview?.consignors || [];
  const settled = batch && ['COMPLETED', 'PARTIAL'].includes(batch.status);
  const liveOff = preview && !preview.liveTransfersEnabled;

  return (
    <TierGate
      requiredTier="TEAMS"
      featureName="Consignor Settlement"
      description="Settle a sale across multiple consignors with one approval. Available on TEAMS and above."
    >
      <Head>
        <title>Consignor Settlement | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.push('/organizer/consignors')}
            className="text-sm text-amber-600 dark:text-amber-400 hover:underline mb-4"
          >
            &larr; Back to Consignors
          </button>

          <h1 className="text-3xl font-bold text-warm-900 dark:text-white">
            Settlement
          </h1>
          <p className="text-warm-600 dark:text-warm-400 mt-1 mb-6">
            {preview?.saleTitle || 'Sale'} — split sold-item proceeds across consignors
          </p>

          {/* Test-mode banner */}
          {liveOff && (
            <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-800 dark:text-amber-300">Test mode</p>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Approving will record the split and simulate payouts. No money moves until
                  online transfers are turned on.
                </p>
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center border border-warm-200 dark:border-gray-700">
              <p className="text-warm-600 dark:text-warm-400">
                No sold consignor items found for this sale yet.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-warm-200 dark:border-gray-700 overflow-hidden">
              {/* Split table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-warm-50 dark:bg-gray-700/50 text-left">
                    <tr className="text-warm-600 dark:text-warm-400">
                      <th className="px-4 py-3 font-bold">Consignor</th>
                      <th className="px-4 py-3 font-bold text-right">Items</th>
                      <th className="px-4 py-3 font-bold text-right">Gross</th>
                      <th className="px-4 py-3 font-bold text-right">Rate</th>
                      <th className="px-4 py-3 font-bold text-right">Net Payout</th>
                      <th className="px-4 py-3 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-200 dark:divide-gray-700">
                    {rows.map((r) => {
                      const payout = batch?.payouts?.find(
                        (p) => p.consignor?.name === r.name
                      );
                      const status =
                        payout?.status ||
                        (r.stripeOnboarded ? 'PENDING' : 'MANUAL_CASH_CHECK');
                      return (
                        <tr key={r.consignorId} className="text-warm-900 dark:text-white">
                          <td className="px-4 py-3">
                            <div className="font-medium">{r.name}</div>
                            {!r.stripeOnboarded && (
                              <div className="text-xs text-purple-600 dark:text-purple-400">
                                Manual cash/check — not set up for online payout
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">{r.itemCount}</td>
                          <td className="px-4 py-3 text-right">{fmt(r.gross)}</td>
                          <td className="px-4 py-3 text-right">
                            {Number(r.commissionRate).toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-right font-bold">{fmt(r.net)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2 py-1 rounded text-xs font-bold ${statusBadge(
                                status
                              )}`}
                            >
                              {status.replace(/_/g, ' ')}
                            </span>
                            {payout?.failureReason && (
                              <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                                {payout.failureReason}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-warm-50 dark:bg-gray-700/50 font-bold text-warm-900 dark:text-white">
                    <tr>
                      <td className="px-4 py-3" colSpan={2}>
                        Total
                      </td>
                      <td className="px-4 py-3 text-right">
                        {fmt(preview?.totalGross || 0)}
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right">
                        {fmt(preview?.totalConsignorPayouts || 0)}
                      </td>
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Action footer */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 border-t border-warm-200 dark:border-gray-700">
                <div className="text-sm text-warm-600 dark:text-warm-400">
                  {batch ? (
                    <span className="flex items-center gap-2">
                      Batch status:
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-bold ${statusBadge(
                          batch.status
                        )}`}
                      >
                        {batch.status}
                      </span>
                    </span>
                  ) : (
                    'No batch created yet'
                  )}
                </div>

                {!batch ? (
                  <button
                    onClick={handleCreateBatch}
                    disabled={creating}
                    className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-2 px-5 rounded-lg transition-colors"
                  >
                    <DollarSign className="w-4 h-4" />
                    {creating ? 'Creating...' : 'Create Settlement Batch'}
                  </button>
                ) : settled ? (
                  <span className="flex items-center gap-2 text-green-600 dark:text-green-400 font-bold">
                    <CheckCircle2 className="w-5 h-5" />
                    Settled
                  </span>
                ) : (
                  <button
                    onClick={handleApprove}
                    disabled={approving}
                    className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-2 px-5 rounded-lg transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {approving ? 'Approving...' : 'Approve & Pay Consignors'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </TierGate>
  );
};

export default ConsignorSettlementPage;
