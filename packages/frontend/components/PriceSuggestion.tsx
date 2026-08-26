/**
 * PriceSuggestion Component — CD2 Phase 3, repurposed 2026-08-24
 *
 * Shows a price suggestion for items, now backed by the multi-source pricing engine
 * (POST /pricing/estimate) instead of the legacy LLM-driven /items/ai/price-suggest route.
 * Displays a suggestion card with low/high price range and reasoning.
 * Allows organizer to apply the suggested price to the item form.
 *
 * Refresh-only: calling /pricing/estimate with itemId set causes the orchestrator to
 * upsert ItemCompLookup server-side (a cache refresh) — it does NOT touch item.price or
 * item.aiSuggestedPrice directly. The organizer still must click "Use $X" below to move
 * the number into the price input, then save the item form as normal (same flow as before,
 * just fed by the better engine). D-005 (never auto-overwrite organizer-set price) is
 * satisfied by construction since this path never writes item.price itself.
 *
 * FLOOR handling: when the engine returns confidence: 'FLOOR' (no real comps found), no
 * suggestion card is rendered at all — a $0.49 "suggestion" with zero real data reads as
 * broken, not helpful. Per the hidden-confidence-in-UI decision (2026-08-24), no range/
 * confidence-badge/source-breakdown UI is shown beyond what already existed here.
 *
 * Safety guard (S977): if suggestion is <50% of currentPrice, shows a warning
 * confirmation step before applying — prevents catastrophic price replacement.
 */

import React, { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';

interface PriceSuggestionProps {
  itemId?: string; // when set, the orchestrator caches its result on ItemCompLookup
  title: string;
  category: string;
  condition: string;
  conditionGrade?: string;
  photoUrls?: string[];
  currentPrice?: number;
  onApplyPrice: (price: number) => void;
  /**
   * 2026-08-26 fix (Patrick): 'Re-analyze'/'Identify precisely' on the review queue
   * and edit-item page can change title/category/condition, but this component never
   * reacted to that -- it only fetches on an explicit 'Suggest Price' click, so a stale
   * suggestion (or none at all) sat there describing the item's OLD identity. Bump this
   * value (e.g. a counter) after a successful re-analyze to trigger a fresh fetch here.
   */
  autoRefreshToken?: number;
}

interface SuggestionResult {
  low: number;
  high: number;
  suggested: number;
  reasoning: string;
}

const PriceSuggestion: React.FC<PriceSuggestionProps> = ({
  itemId,
  title,
  category,
  condition,
  conditionGrade,
  photoUrls,
  currentPrice,
  onApplyPrice,
  autoRefreshToken,
}) => {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestionResult | null>(null);
  const [noDataYet, setNoDataYet] = useState(false);
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
    setNoDataYet(false);
    setPendingConfirm(false);

    try {
      const response = await api.post('/pricing/estimate', {
        ...(itemId ? { itemId } : {}),
        title: title.trim(),
        category: category.trim(),
        condition: condition.trim(),
        ...(conditionGrade ? { conditionGrade } : {}),
        ...(photoUrls && photoUrls.length > 0 ? { photoUrls } : {}),
      });

      const result = response.data;

      if (result.confidence === 'FLOOR') {
        // No real comps found — don't show a bare $0.49 as if it were a real number.
        setNoDataYet(true);
        return;
      }

      // PricingResult amounts are in cents; this card displays dollars.
      setSuggestion({
        low: result.priceRange.low / 100,
        high: result.priceRange.high / 100,
        suggested: result.estimatedPrice / 100,
        reasoning: result.reasoning || '',
      });
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.error || 'Failed to generate price suggestion';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh: re-analyze changed the underlying title/category/condition, so any
  // suggestion on screen now describes the item's OLD identity -- clear it and, if the
  // fields are still fillable, fetch a fresh one automatically. Skips the initial mount
  // (token starts undefined) so this never fires before the organizer has ever asked for
  // a suggestion at all.
  useEffect(() => {
    if (autoRefreshToken === undefined) return;
    setSuggestion(null);
    setNoDataYet(false);
    setError(null);
    if (isEnabled) {
      handleSuggestPrice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefreshToken]);

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

      {noDataYet && !error && (
        <div className="p-3 bg-warm-50 dark:bg-gray-800 border border-warm-200 dark:border-gray-600 rounded-lg text-sm text-warm-600 dark:text-warm-400">
          Not enough market data yet for this item — try again once more comps are available.
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
                  ${suggestion.low.toFixed(2)} – ${suggestion.high.toFixed(2)}
                </span>
                <span className="text-warm-500 dark:text-warm-400"> (suggested: </span>
                <span className="font-bold text-amber-700 dark:text-amber-300">
                  ${suggestion.suggested.toFixed(2)}
                </span>
                <span className="text-warm-500 dark:text-warm-400">)</span>
              </p>
            </div>
          </div>

          {suggestion.reasoning && (
            <p className="text-sm text-warm-600 dark:text-warm-400 italic">
              {suggestion.reasoning}
            </p>
          )}

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
