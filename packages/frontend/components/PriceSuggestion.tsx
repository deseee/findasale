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
        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${
          isEnabled && !loading
            ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 cursor-pointer'
            : 'bg-warm-100 text-warm-400 cursor-not-allowed opacity-50'
        }`}
      >
        <span className="text-base">💡</span>
        {loading ? 'Analyzing...' : 'Suggest Price'}
      </button>

      {error && !suggestion && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {suggestion && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-semibold text-warm-900 mb-1">
                Smart Price Suggestion
              </h4>
              <p className="text-sm text-warm-600">
                <span className="font-medium text-amber-700">
                  ${suggestion.low} – ${suggestion.high}
                </span>
                <span className="text-warm-500"> (suggested: </span>
                <span className="font-bold text-amber-700">
                  ${suggestion.suggested}
                </span>
                <span className="text-warm-500">)</span>
              </p>
            </div>
          </div>

          <p className="text-sm text-warm-600 italic">
            {suggestion.reasoning}
          </p>

          <button
            type="button"
            onClick={handleApplyPrice}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-3 rounded-lg transition text-sm"
          >
            Use ${suggestion.suggested.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  );
};

export default PriceSuggestion;
