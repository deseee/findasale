import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface DisputeFormProps {
  itemId: string;
  itemTitle: string;
  orderId: string;
  saleId: string;
  userEmail: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const REASON_OPTIONS = [
  { value: 'condition_mismatch', label: 'Condition Mismatch' },
  { value: 'item_missing', label: 'Item Missing' },
  { value: 'wrong_item', label: 'Wrong Item Received' },
  { value: 'other', label: 'Other' },
];

const DisputeForm: React.FC<DisputeFormProps> = ({
  itemId,
  itemTitle,
  orderId,
  saleId,
  userEmail,
  onSuccess,
  onCancel,
}) => {
  const { showToast } = useToast();
  const [reason, setReason] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [charCount, setCharCount] = useState<number>(0);

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/disputes', {
        orderId,
        saleId,
        itemId,
        reason,
        description,
      });
      return response.data;
    },
    onSuccess: () => {
      showToast('Your dispute has been submitted. We\'ll respond within 2 business days.', 'success');
      onSuccess();
    },
    onError: (err: any) => {
      showToast(err.response?.data?.message || 'Failed to submit dispute', 'error');
    },
  });

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setDescription(text);
    setCharCount(text.length);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!reason) {
      showToast('Please select a reason', 'error');
      return;
    }

    if (description.length < 50) {
      showToast('Description must be at least 50 characters', 'error');
      return;
    }

    createMutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6 bg-white rounded-lg border border-warm-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-warm-900">Report an Issue</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-warm-500 hover:text-warm-700 font-medium"
        >
          ✕
        </button>
      </div>

      <p className="text-sm text-warm-600">
        Item: <span className="font-medium text-warm-900">{itemTitle}</span>
      </p>

      {/* Reason Select */}
      <div>
        <label className="block text-sm font-medium text-warm-700 mb-2">
          What's the issue? <span className="text-red-500">*</span>
        </label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2 border border-warm-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600 bg-white"
        >
          <option value="">-- Select a reason --</option>
          {REASON_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Description Textarea */}
      <div>
        <label className="block text-sm font-medium text-warm-700 mb-2">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          value={description}
          onChange={handleDescriptionChange}
          placeholder="Please describe the issue in detail. What did you expect vs. what did you receive?"
          className="w-full px-3 py-2 border border-warm-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-600 resize-none"
          rows={5}
        />
        <div className="text-xs text-warm-500 mt-1">
          {charCount} / 50 characters minimum
        </div>
      </div>

      {/* Contact Email (Pre-filled) */}
      <div>
        <label className="block text-sm font-medium text-warm-700 mb-2">
          Contact Email
        </label>
        <input
          type="email"
          value={userEmail}
          readOnly
          className="w-full px-3 py-2 border border-warm-300 rounded-lg bg-warm-50 text-warm-600 cursor-not-allowed"
        />
        <p className="text-xs text-warm-500 mt-1">
          We'll use this to contact you about your dispute
        </p>
      </div>

      {/* Buttons */}
      <div className="flex gap-3 pt-4 border-t border-warm-200">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-warm-300 text-warm-700 font-medium rounded-lg hover:bg-warm-50 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="flex-1 px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {createMutation.isPending ? 'Submitting...' : 'Submit Dispute'}
        </button>
      </div>
    </form>
  );
};

export default DisputeForm;
