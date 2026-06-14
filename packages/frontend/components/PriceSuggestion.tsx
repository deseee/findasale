/**
 * PriceSuggestion Component — CD2 Phase 3
 *
 * Shows AI-powered price suggestions for items based on title, category, and condition.
 * Displays a suggestion card with low/high price range and reasoning.
 * Allows organizer to apply the suggested price to the item form.
 *
 * Safety guard (S977): if suggestion is <50% of currentPrice, shows a warning
 * confirmation step before applying — prevents catastrophic price replacement.
 */

import React, { useState } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface PriceSuggestionProps {
  title: string;
  category: string;
  condition: string;
  currentPrice?: number;
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
  currentPrice,
  onApplyPrice,
}) => {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState(false);
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
    setPendingConfirm(false);

    try {
      const response = await api.post('/items/ai/price-suggest', {
        title: title.trim(),
        category: category.trim(),
        condition: condition.trim(),
        ...(currentPrice && currentPrice > 0 ? { currentPrice } : {}),
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

  const applyPrice = (price: number) => {
    onApplyPrice(price);
    showToast(`Price set to $${price.toFixed(2)}`, 'success');
    setSuggestion(null);
    setPendingConfirm(false);
  };

  const handleApplyPrice = () => {
    if (!suggestion) return;

    // Safety guard: warn if suggestion is <50% of current price
    const hasCurrentPrice = currentPrice && currentPrice > 0;
    const isLargeDrop = hasCurrentPrice && suggestion.suggested < currentPrice * 0.5;

    if (isLargeDrop) {
      setPendingConfirm(true);
      return;
    }

    applyPrice(suggestion.suggested);
  };

  const dropPct = suggestion && currentPrice && currentPrice > 0
    ? Math.round((1 - suggestion.suggested / currentPrice) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleSuggestPrice}
        disabled={!isEnabled || loading}
        className={`px-6 py-2.5 rounded-lg font-medium transition text-xs w-full ${
          isEnabled && !loading
            ? 'bg-[#4A7C59] hover:bg-[#3d654a] text-white cursor-pointer dark:bg-[#4A7C59] dark:hover:bg-[#3d654a]'
            : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-50'
        }`}
      >
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

          {pendingConfirm ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                ⚠️ This is {dropPct}% below your current price of ${currentPrice?.toFixed(2)}. Replace it?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => applyPrice(suggestion.suggested)}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  Yes, use ${suggestion.suggested.toFixed(2)}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingConfirm(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-warm-800 dark:text-warm-200 text-xs font-medium rounded-lg transition-colors"
                >
                  Keep ${currentPrice?.toFixed(2)}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleApplyPrice}
              className="px-6 py-2.5 bg-[#4A7C59] hover:bg-[#3d654a] dark:bg-[#4A7C59] dark:hover:bg-[#3d654a] text-white text-xs font-medium rounded-lg transition-colors"
            >
              Use ${suggestion.suggested.toFixed(2)}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PriceSuggestion;
