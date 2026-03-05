/**
 * V2: Organizer Payouts Page
 *
 * Displays available + pending Stripe balance, lets organizers:
 * - Change their automatic payout schedule (daily / weekly / monthly / manual)
 * - Trigger an on-demand payout (standard or instant)
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import Head from 'next/head';
import Link from 'next/link';

type Interval = 'daily' | 'weekly' | 'monthly' | 'manual';

const INTERVAL_LABELS: Record<Interval, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  manual: 'Manual (on-demand only)',
};

const OrganizerPayoutsPage = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'standard' | 'instant'>('standard');
  const [selectedInterval, setSelectedInterval] = useState<Interval | null>(null);

  if (!authLoading && (!user || user.role !== 'ORGANIZER')) {
    router.push('/login');
    return null;
  }

  // ─── Data fetching ───────────────────────────────────────────────────────────

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['stripe-balance'],
    queryFn: async () => {
      const res = await api.get('/stripe/balance');
      return res.data as { available: number; pending: number };
    },
    enabled: !!user?.id,
  });

  const { data: schedule, isLoading: scheduleLoading } = useQuery({
    queryKey: ['payout-schedule'],
    queryFn: async () => {
      const res = await api.get('/stripe/payout-schedule');
      return res.data as { interval: Interval; weeklyAnchor: string | null; monthlyAnchor: number | null };
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (schedule && selectedInterval === null) setSelectedInterval(schedule.interval);
  }, [schedule]);

  // ─── Mutations ───────────────────────────────────────────────────────────────

  const updateScheduleMutation = useMutation({
    mutationFn: (interval: Interval) => api.patch('/stripe/payout-schedule', { interval }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payout-schedule'] });
      showToast('Payout schedule updated', 'success');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to update schedule', 'error');
    },
  });

  const createPayoutMutation = useMutation({
    mutationFn: () =>
      api.post('/stripe/payout', {
        amount: parseFloat(payoutAmount),
        method: payoutMethod,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['stripe-balance'] });
      const { amount, method, arrivalDate } = res.data;
      const arrival = arrivalDate ? new Date(arrivalDate).toLocaleDateString() : 'soon';
      showToast(
        `$${amount.toFixed(2)} ${method} payout initiated — expected ${arrival}`,
        'success'
      );
      setPayoutAmount('');
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to create payout', 'error');
    },
  });

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleScheduleSave = () => {
    if (!selectedInterval) return;
    updateScheduleMutation.mutate(selectedInterval);
  };

  const handlePayoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(payoutAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Enter a valid payout amount', 'error');
      return;
    }
    if (balance && amount > balance.available) {
      showToast(`Amount exceeds available balance ($${balance.available.toFixed(2)})`, 'error');
      return;
    }
    createPayoutMutation.mutate();
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;

  const currentInterval = selectedInterval ?? schedule?.interval ?? 'daily';
  const scheduleChanged = schedule && selectedInterval !== null && selectedInterval !== schedule.interval;

  return (
    <>
      <Head>
        <title>Payouts - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <Link href="/organizer/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
              ← Dashboard
            </Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-lg font-semibold text-gray-900">Payouts</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

          {/* Balance card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">
              Stripe Balance
            </h2>
            {balanceLoading ? (
              <p className="text-gray-400 text-sm">Loading balance…</p>
            ) : (
              <div className="flex gap-8">
                <div>
                  <p className="text-3xl font-bold text-gray-900">
                    ${(balance?.available ?? 0).toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Available</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-400">
                    ${(balance?.pending ?? 0).toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Pending</p>
                </div>
              </div>
            )}
          </div>

          {/* Payout schedule */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
              Automatic Payout Schedule
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              How often Stripe automatically sends your available balance to your bank.
              Choose <strong>Manual</strong> to only get paid when you request it below.
            </p>

            {scheduleLoading ? (
              <p className="text-gray-400 text-sm">Loading schedule…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-4">
                  {(Object.keys(INTERVAL_LABELS) as Interval[]).map((interval) => (
                    <button
                      key={interval}
                      onClick={() => setSelectedInterval(interval)}
                      className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        currentInterval === interval
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'
                      }`}
                    >
                      {INTERVAL_LABELS[interval]}
                    </button>
                  ))}
                </div>

                {scheduleChanged && (
                  <button
                    onClick={handleScheduleSave}
                    disabled={updateScheduleMutation.isPending}
                    className="bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {updateScheduleMutation.isPending ? 'Saving…' : 'Save schedule'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Manual payout */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
              Request a Payout
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              Send funds from your available balance to your bank right now.
              Instant payouts (1–30 min) require an eligible debit card on file in Stripe.
            </p>

            <form onSubmit={handlePayoutSubmit} className="space-y-4">
              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {balance && (
                  <button
                    type="button"
                    onClick={() => setPayoutAmount(balance.available.toFixed(2))}
                    className="text-xs text-blue-600 hover:underline mt-1"
                  >
                    Use full available balance (${balance.available.toFixed(2)})
                  </button>
                )}
              </div>

              {/* Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Method</label>
                <div className="flex gap-3">
                  {(['standard', 'instant'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayoutMethod(m)}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        payoutMethod === m
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'
                      }`}
                    >
                      {m === 'standard' ? 'Standard (1–5 days)' : 'Instant (1–30 min)'}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={createPayoutMutation.isPending || !payoutAmount}
                className="w-full bg-green-600 text-white text-sm font-medium py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {createPayoutMutation.isPending ? 'Initiating payout…' : 'Request payout'}
              </button>
            </form>
          </div>

        </div>
      </div>
    </>
  );
};

export default OrganizerPayoutsPage;
