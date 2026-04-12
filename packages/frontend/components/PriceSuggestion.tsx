/**
 * PriceSuggestion Component — CD2 Phase 3
 *
 * Shows AI-powered price suggestions for items based on title, category, and condition.
 * Displays a suggestion card with low/high price range and reasoning.
 * Allows organizer to apply the suggested price to the item form.
 */

import React, { useState } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface PriceSuggestionProps {
  title: string;
  category: string;
  condition: string;
  onApplyPrice: (price: number) => void;
}

interface SuggestionResult {
  low: number;
  high: number;
  suggested: number;
  reasoning: string;
}

const PriceSuggestion: React.FC<PriceSuggestionProps> = ({
  title,
  category,
  condition,
  onApplyPrice,
}) => {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const isEnabled = title.trim().length > 0 && category.trim().length > 0;

  const handleSuggestPrice = async () => {
    if (!isEnabled) {
      setError('Please enter a title and select a category');
      return;
    }

    setLoading(true);
    setError(null);
    setSuggestion(null);

    try {
      const response = await api.post('/items/ai/price-suggest', {
        title: title.trim(),
        category: category.trim(),
        condition: condition.trim(),
      });

      setSuggestion(response.data);
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.error || 'Failed to generate price suggestion';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPrice = () => {
    if (suggestion) {
      onApplyPrice(suggestion.suggested);
      showToast(
        `Price set to $${suggestion.suggested.toFixed(2)}`,
        'success'
      );
      setSuggestion(null);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleSuggestPrice}
        disabled={!isEnabled || loading}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition ${
          isEnabled && !loading
            ? 'bg-[#4A7C59] hover:bg-[#3d654a] text-white cursor-pointer dark:bg-[#4A7C59] dark:hover:bg-[#3d654a]'
            : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-50'
        }`}
      >
        <span className="text-base">💡</span>
        {loading ? 'Analyzing...' : 'Suggest Price'}
      </button>

      {error && !suggestion && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {suggestion && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-semibold text-warm-900 dark:text-warm-100 mb-1">
                Smart Price Suggestion
              </h4>
              <p className="text-sm text-warm-600 dark:text-warm-400">
                <span className="font-medium text-amber-700 dark:text-amber-300">
                  ${suggestion.low} – ${suggestion.high}
                </span>
                <span className="text-warm-500 dark:text-warm-400"> (suggested: </span>
                <span className="font-bold text-amber-700 dark:text-amber-300">
                  ${suggestion.suggested}
                </span>
                <span className="text-warm-500 dark:text-warm-400">)</span>
              </p>
            </div>
          </div>

          <p className="text-sm text-warm-600 dark:text-warm-400 italic">
            {suggestion.reasoning}
          </p>

          <button
            type="button"
            onClick={handleApplyPrice}
            className="w-full bg-[#4A7C59] hover:bg-[#3d654a] dark:bg-[#4A7C59] dark:hover:bg-[#3d654a] text-white font-medium py-2.5 px-4 rounded-lg transition text-sm"
          >
            Use ${suggestion.suggested.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  );
};

export default PriceSuggestion;
