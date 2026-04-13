/**
 * Commission Calculator — Feature #228
 * Editable commission %, shows organizer vs client split with visual breakdown
 */
import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface CommissionCalculatorProps {
  saleId: string;
  totalRevenue: number;
  totalExpenses: number;
  currentRate: number | null;
  clientLabel: string;
}

export default function CommissionCalculator({
  saleId,
  totalRevenue,
  totalExpenses,
  currentRate,
  clientLabel,
}: CommissionCalculatorProps) {
  const [rate, setRate] = useState<string>(currentRate != null ? String(currentRate) : '');
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  useEffect(() => {
    if (currentRate != null) setRate(String(currentRate));
  }, [currentRate]);

  const updateMutation = useMutation({
    mutationFn: (commissionRate: number) =>
      api.patch(`/sales/${saleId}/settlement`, { commissionRate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlement', saleId] });
      showToast('Commission updated', 'success');
    },
    onError: () => showToast('Failed to update commission', 'error'),
  });

  const rateNum = parseFloat(rate) || 0;
  const commissionAmount = totalRevenue * (rateNum / 100);
  const clientAmount = totalRevenue - commissionAmount - totalExpenses;
  const organizerPct = totalRevenue > 0 ? Math.round((commissionAmount / totalRevenue) * 100) : 0;
  const clientPct = totalRevenue > 0 ? Math.round((clientAmount / totalRevenue) * 100) : 0;

  const handleBlur = () => {
    const numRate = parseFloat(rate);
    if (!isNaN(numRate) && numRate !== currentRate) {
      updateMutation.mutate(numRate);
    }
  };

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Commission Split</h4>

      {/* Rate input */}
      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm text-gray-600 dark:text-gray-400">Commission Rate:</label>
        <div className="relative">
          <input
            type="number"
            step="0.5"
            min="0"
            max="100"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            onBlur={handleBlur}
            className="w-20 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-right pr-6"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
        </div>
        {updateMutation.isPending && (
          <span className="text-xs text-gray-400">Saving...</span>
        )}
      </div>

      {/* Visual split bar */}
      {totalRevenue > 0 && (
        <div className="mb-4">
          <div className="flex rounded-full h-3 overflow-hidden bg-gray-200 dark:bg-gray-700">
            {organizerPct > 0 && (
              <div
                className="bg-blue-500 transition-all duration-300"
                style={{ width: `${organizerPct}%` }}
                title={`Your commission: ${organizerPct}%`}
              />
            )}
            {totalExpenses > 0 && (
              <div
                className="bg-red-400 transition-all duration-300"
                style={{ width: `${totalRevenue > 0 ? Math.round((totalExpenses / totalRevenue) * 100) : 0}%` }}
                title="Expenses"
              />
            )}
            {clientPct > 0 && (
              <div
                className="bg-green-500 transition-all duration-300"
                style={{ width: `${Math.max(0, clientPct)}%` }}
                title={`${clientLabel}: ${clientPct}%`}
              />
            )}
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Your commission
            </span>
            {totalExpenses > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Expenses
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> {clientLabel}
            </span>
          </div>
        </div>
      )}

      {/* Breakdown */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Total Revenue</span>
          <span className="font-medium text-gray-900 dark:text-white">${totalRevenue.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Your Commission ({rateNum}%)</span>
          <span className="font-medium text-blue-600 dark:text-blue-400">${commissionAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Expenses</span>
          <span className="font-medium text-red-600 dark:text-red-400">-${totalExpenses.toFixed(2)}</span>
        </div>
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between">
          <span className="font-semibold text-gray-700 dark:text-gray-200">{clientLabel} Receives</span>
          <span className="font-bold text-green-600 dark:text-green-400">
            ${Math.max(0, clientAmount).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
