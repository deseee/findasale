import React, { useState } from 'react';
import { useSubmitResponse } from '../hooks/useAppraisal';
import { useToast } from './ToastContext';

interface AppraisalResponseFormProps {
  requestId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const EXPERTISE_OPTIONS = [
  'GENERALIST',
  'ANTIQUES',
  'ART',
  'JEWELRY',
  'COINS',
  'FURNITURE',
  'BOOKS',
  'ELECTRONICS',
  'CLOTHING',
] as const;

const AppraisalResponseForm: React.FC<AppraisalResponseFormProps> = ({
  requestId,
  onSuccess,
  onCancel,
}) => {
  const { showToast } = useToast();
  const submitMutation = useSubmitResponse(requestId);

  const [formData, setFormData] = useState({
    estimatedLow: '',
    estimatedHigh: '',
    confidence: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH',
    expertise: '' as string,
    reasoning: '',
  });

  const reasoningLength = formData.reasoning.length;
  const remainingChars = Math.max(50 - reasoningLength, 0);
  const isReasoningValid = reasoningLength >= 50;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.estimatedLow || !formData.estimatedHigh) {
      showToast('Please enter both low and high estimates', 'error');
      return;
    }

    if (!isReasoningValid) {
      showToast('Reasoning must be at least 50 characters', 'error');
      return;
    }

    const low = Math.round(parseFloat(formData.estimatedLow) * 100);
    const high = Math.round(parseFloat(formData.estimatedHigh) * 100);

    if (low >= high) {
      showToast('Low estimate must be less than high estimate', 'error');
      return;
    }

    try {
      await submitMutation.mutateAsync({
        estimatedLow: low,
        estimatedHigh: high,
        confidence: formData.confidence,
        expertise: formData.expertise || undefined,
        reasoning: formData.reasoning.trim(),
      });

      showToast('Estimate submitted successfully!', 'success');
      onSuccess?.();

      // Reset form
      setFormData({
        estimatedLow: '',
        estimatedHigh: '',
        confidence: 'MEDIUM',
        expertise: '',
        reasoning: '',
      });
    } catch (error: any) {
      showToast(
        error.response?.data?.message || 'Failed to submit estimate',
        'error'
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-warm-900 dark:text-gray-100 mb-4">
        Submit Your Estimate
      </h3>

      {/* Price Range */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
            Low Estimate ($)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={formData.estimatedLow}
            onChange={(e) =>
              setFormData({ ...formData, estimatedLow: e.target.value })
            }
            placeholder="0.00"
            className="w-full border border-warm-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-warm-900 dark:text-white text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
            High Estimate ($)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={formData.estimatedHigh}
            onChange={(e) =>
              setFormData({ ...formData, estimatedHigh: e.target.value })
            }
            placeholder="0.00"
            className="w-full border border-warm-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-warm-900 dark:text-white text-sm"
            required
          />
        </div>
      </div>

      {/* Confidence */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
          Confidence
        </label>
        <select
          value={formData.confidence}
          onChange={(e) =>
            setFormData({
              ...formData,
              confidence: e.target.value as 'LOW' | 'MEDIUM' | 'HIGH',
            })
          }
          className="w-full border border-warm-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-warm-900 dark:text-white text-sm"
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </div>

      {/* Expertise */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
          Expertise (Optional)
        </label>
        <select
          value={formData.expertise}
          onChange={(e) => setFormData({ ...formData, expertise: e.target.value })}
          className="w-full border border-warm-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-warm-900 dark:text-white text-sm"
        >
          <option value="">Select expertise...</option>
          {EXPERTISE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {/* Reasoning */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-warm-700 dark:text-gray-300 mb-1">
          Reasoning (min 50 chars)
        </label>
        <textarea
          value={formData.reasoning}
          onChange={(e) => setFormData({ ...formData, reasoning: e.target.value })}
          placeholder="Explain your estimate and how you arrived at this price range..."
          rows={4}
          className="w-full border border-warm-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-700 text-warm-900 dark:text-white text-sm"
        />
        <p
          className={`text-xs mt-1 ${
            isReasoningValid
              ? 'text-green-600 dark:text-green-400'
              : 'text-warm-500 dark:text-gray-400'
          }`}
        >
          {remainingChars > 0
            ? `${remainingChars} characters remaining`
            : 'Ready to submit'}
        </p>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-md text-warm-900 dark:text-gray-100 hover:bg-warm-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitMutation.isPending || !isReasoningValid}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-md font-medium transition-colors"
        >
          {submitMutation.isPending ? 'Submitting...' : 'Submit Estimate'}
        </button>
      </div>
    </form>
  );
};

export default AppraisalResponseForm;
