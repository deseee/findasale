import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface FlashDealFormProps {
  saleId: string;
  saleItems: Array<{ id: string; title: string; price?: number }>;
  onSuccess: () => void;
  onCancel: () => void;
}

const DISCOUNT_OPTIONS = [10, 15, 20, 25, 30, 40, 50];
const DURATION_OPTIONS = [
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: '4 hours' },
  { minutes: 360, label: '6 hours' },
  { minutes: 720, label: '12 hours' },
];

const FlashDealForm: React.FC<FlashDealFormProps> = ({
  saleId,
  saleItems,
  onSuccess,
  onCancel,
}) => {
  const { showToast } = useToast();
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [discountPct, setDiscountPct] = useState<number>(25);
  const [durationMinutes, setDurationMinutes] = useState<number>(120);

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/flash-deals', {
        itemId: selectedItemId,
        discountPct,
        durationMinutes,
      });
      return response.data;
    },
    onSuccess: () => {
      showToast('Flash deal created!', 'success');
      onSuccess();
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to create flash deal', 'error');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) {
      showToast('Please select an item', 'error');
      return;
    }
    createMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-warm-50 dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-warm-900 dark:text-white">Create Flash Deal</h3>

      {/* Item Select */}
      <div>
        <label className="block text-sm font-medium text-warm-700 dark:text-gray-200 mb-1">Select Item</label>
        <select
          value={selectedItemId}
          onChange={(e) => setSelectedItemId(e.target.value)}
          className="w-full px-3 py-2 border border-warm-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">-- Choose an item --</option>
          {saleItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} {item.price ? `($${item.price})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Discount % */}
      <div>
        <label className="block text-sm font-medium text-warm-700 dark:text-gray-200 mb-1">Discount %</label>
        <div className="flex flex-wrap gap-2">
          {DISCOUNT_OPTIONS.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setDiscountPct(pct)}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                discountPct === pct
                  ? 'bg-amber-600 text-white'
                  : 'bg-white dark:bg-gray-700 border border-warm-300 dark:border-gray-600 text-warm-900 dark:text-gray-200 hover:border-amber-600 dark:hover:border-amber-500'
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div>
        <label className="block text-sm font-medium text-warm-700 dark:text-gray-200 mb-1">Duration</label>
        <div className="grid grid-cols-2 gap-2">
          {DURATION_OPTIONS.map((opt) => (
            <button
              key={opt.minutes}
              type="button"
              onClick={() => setDurationMinutes(opt.minutes)}
              className={`px-3 py-2 rounded-lg font-medium transition-colors text-sm ${
                durationMinutes === opt.minutes
                  ? 'bg-amber-600 text-white'
                  : 'bg-white dark:bg-gray-700 border border-warm-300 dark:border-gray-600 text-warm-900 dark:text-gray-200 hover:border-amber-600 dark:hover:border-amber-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-bold py-2 px-4 rounded-lg transition-colors"
        >
          {createMutation.isPending ? 'Creating...' : 'Create Deal'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-warm-300 dark:border-gray-600 text-warm-700 dark:text-gray-300 rounded-lg hover:bg-warm-100 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

export default FlashDealForm;
