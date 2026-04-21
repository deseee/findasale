import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface ConsignorPayoutModalProps {
  consignorId: string;
  consignorName: string;
  commissionRate: number;
  onClose: () => void;
  onSuccess: () => void;
}

interface PayoutSummary {
  totalSales: string | number;
  commissionAmount: string | number;
  netPayout: string | number;
  method: string;
}

const ConsignorPayoutModal: React.FC<ConsignorPayoutModalProps> = ({
  consignorId,
  consignorName,
  commissionRate,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useToast();

  const [saleId, setSaleId] = useState<string>('');
  const [method, setMethod] = useState<string>('CASH');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sales, setSales] = useState<Array<{ id: string; title: string }>>([]);
  const [loadingSales, setLoadingSales] = useState(true);
  const [payoutResult, setPayoutResult] = useState<PayoutSummary | null>(null);

  // Fetch organizer's sales on mount
  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    try {
      setLoadingSales(true);
      const response = await api.get('/api/sales/mine');
      setSales(response.data.sales || []);
    } catch (error: any) {
      console.error('Error fetching sales:', error);
      showToast('Failed to load sales', 'error');
    } finally {
      setLoadingSales(false);
    }
  };

  const handleRunPayout = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!method) {
      showToast('Please select a payment method', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        saleId: saleId || undefined,
        method,
        notes: notes || undefined,
      };

      const response = await api.post(`/api/consignors/${consignorId}/payout`, payload);
      setPayoutResult(response.data);
      showToast('Payout created successfully', 'success');

      // Reset form
      setSaleId('');
      setMethod('CASH');
      setNotes('');

      // Call onSuccess after a delay to show success state
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (error: any) {
      console.error('Error running payout:', error);
      showToast(error.response?.data?.error || 'Failed to run payout', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-warm-900 dark:text-white mb-1">
          Process Payout
        </h2>
        <p className="text-sm text-warm-500 dark:text-warm-400 mb-4">
          {consignorName} — {Number(commissionRate).toFixed(1)}% commission
        </p>

        {payoutResult ? (
          // Success state
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 mb-4">
            <p className="text-sm font-bold text-green-700 dark:text-green-400 mb-3">
              ✓ Payout Processed
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-warm-600 dark:text-warm-400">Total Sales:</span>
                <span className="font-bold text-warm-900 dark:text-white">
                  ${Number(payoutResult.totalSales).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-warm-600 dark:text-warm-400">Commission ({commissionRate}%):</span>
                <span className="font-bold text-warm-900 dark:text-white">
                  ${Number(payoutResult.commissionAmount).toFixed(2)}
                </span>
              </div>
              <div className="border-t border-green-200 dark:border-green-700 pt-2 mt-2 flex justify-between">
                <span className="text-warm-600 dark:text-warm-400">Net Payout:</span>
                <span className="font-bold text-green-600 dark:text-green-400 text-lg">
                  ${Number(payoutResult.netPayout).toFixed(2)}
                </span>
              </div>
              <div className="text-xs text-warm-500 dark:text-warm-400 mt-2">
                Method: {payoutResult.method}
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          // Form state
          <form onSubmit={handleRunPayout}>
            <div className="mb-4">
              <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-2">
                Payment Method *
              </label>
              <select
                value={method}
                onChange={e => setMethod(e.target.value)}
                className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                required
              >
                <option value="CASH">Cash</option>
                <option value="CHECK">Check</option>
                <option value="VENMO">Venmo</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-2">
                Sale (Optional — leave blank for all sales)
              </label>
              {loadingSales ? (
                <p className="text-sm text-warm-500 dark:text-warm-400">Loading sales...</p>
              ) : (
                <select
                  value={saleId}
                  onChange={e => setSaleId(e.target.value)}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                >
                  <option value="">All sales</option>
                  {sales.map(sale => (
                    <option key={sale.id} value={sale.id}>
                      {sale.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="e.g., Paid via Venmo on 3/15"
                className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-6">
              <p className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase">
                Commission Calculation
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                Payout = (Total Sold Item Price) × {Number(commissionRate).toFixed(1)}%
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || loadingSales}
                className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
              >
                {isSubmitting ? 'Processing...' : 'Run Payout'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ConsignorPayoutModal;
