/**
 * Client Payout Panel — Feature #228
 * Payout form: client info, amount, method selector, "Send Payout" button
 */
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface ClientPayoutPanelProps {
  saleId: string;
  clientLabel: string;
  suggestedAmount: number;
  existingPayout?: {
    id: string;
    clientName: string;
    amount: number;
    status: string;
    method: string;
    paidAt?: string | null;
  } | null;
}

export default function ClientPayoutPanel({
  saleId,
  clientLabel,
  suggestedAmount,
  existingPayout,
}: ClientPayoutPanelProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [form, setForm] = useState({
    clientName: existingPayout?.clientName || '',
    clientEmail: '',
    clientPhone: '',
    amount: existingPayout?.amount?.toString() || suggestedAmount.toFixed(2),
    method: 'MANUAL' as 'STRIPE_CONNECT' | 'MANUAL',
  });

  const payoutMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post(`/sales/${saleId}/settlement/payout`, {
        ...data,
        amount: parseFloat(data.amount),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlement', saleId] });
      showToast('Payout recorded', 'success');
    },
    onError: () => showToast('Failed to initiate payout', 'error'),
  });

  // If payout already exists, show status
  if (existingPayout) {
    const statusColors: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
      PROCESSING: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
      COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      FAILED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    };

    return (
      <div>
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{clientLabel} Payout</h4>
        <div className="bg-gray-50 dark:bg-gray-750 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Recipient</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">{existingPayout.clientName}</span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Amount</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              ${existingPayout.amount.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Method</span>
            <span className="text-sm text-gray-900 dark:text-white">
              {existingPayout.method === 'STRIPE_CONNECT' ? 'Stripe Connect' : 'Manual (check/cash)'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">Status</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[existingPayout.status] || statusColors.PENDING}`}>
              {existingPayout.status}
            </span>
          </div>
          {existingPayout.paidAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Paid on {new Date(existingPayout.paidAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientName || !form.amount) return;
    payoutMutation.mutate(form);
  };

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">{clientLabel} Payout</h4>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            {clientLabel} Name *
          </label>
          <input
            type="text"
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
            placeholder={`${clientLabel} full name`}
            className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={form.clientEmail}
              onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
              placeholder="email@example.com"
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Phone</label>
            <input
              type="tel"
              value={form.clientPhone}
              onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
              placeholder="(555) 123-4567"
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Payout Amount *</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg pl-7 pr-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Payment Method</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, method: 'MANUAL' })}
              className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                form.method === 'MANUAL'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
              }`}
            >
              Manual (check/cash)
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, method: 'STRIPE_CONNECT' })}
              className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                form.method === 'STRIPE_CONNECT'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
              }`}
            >
              Stripe Connect
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={payoutMutation.isPending || !form.clientName || !form.amount}
          className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {payoutMutation.isPending ? 'Processing...' : `Record ${clientLabel} Payout`}
        </button>
      </form>
    </div>
  );
}
