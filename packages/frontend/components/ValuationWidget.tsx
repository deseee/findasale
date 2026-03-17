import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

interface ValuationData {
  priceLow: number;
  priceHigh: number;
  priceMedian: number;
  confidenceScore: number;
  comparableCount: number;
  method: string;
}

interface ValuationWidgetProps {
  itemId: string;
  currentPrice?: number;
  onPriceSelect?: (price: number) => void;
}

export default function ValuationWidget({
  itemId,
  currentPrice,
  onPriceSelect,
}: ValuationWidgetProps) {
  const { user } = useAuth();
  const [valuation, setValuation] = useState<ValuationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWidget, setShowWidget] = useState(false);

  // Check if organizer is PRO tier
  const isPro = user?.organizerProfile?.subscriptionTier === 'PRO' ||
    user?.organizerTier === 'PRO';

  if (!isPro) {
    return (
      <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950 dark:border-amber-700">
        <p className="text-sm text-amber-900 dark:text-amber-200">
          <strong>Pricing Suggestions:</strong> Upgrade to PRO to see comparable sales estimates.
        </p>
        <a
          href="/organizer/upgrade"
          className="text-xs text-amber-600 dark:text-amber-300 hover:underline mt-2 block"
        >
          View Plans →
        </a>
      </div>
    );
  }

  const loadValuation = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(`/api/items/${itemId}/valuation`);
      if (data.status === 'INSUFFICIENT_DATA') {
        setError(`Not enough comparable sales yet (found ${data.comparableCount})`);
      } else if (data.data) {
        setValuation(data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load valuation');
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceLevel = (score: number): string => {
    if (score >= 80) return 'High';
    if (score >= 50) return 'Medium';
    return 'Low';
  };

  const formatPrice = (price: number): string => {
    return `$${(price / 100).toFixed(2)}`;
  };

  if (!showWidget && !valuation) {
    return (
      <div className="py-2">
        <button
          onClick={() => {
            setShowWidget(true);
            loadValuation();
          }}
          className="text-sm text-sage-600 dark:text-sage-400 hover:underline"
        >
          💡 See comparable sales pricing
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-sage-50 border border-sage-200 dark:bg-sage-950 dark:border-sage-700 mt-4">
      <div className="flex justify-between items-start">
        <h3 className="font-semibold text-sage-900 dark:text-sage-100">Comparable Pricing</h3>
        <button
          onClick={() => setShowWidget(false)}
          className="text-xs text-sage-500 dark:text-sage-400"
        >
          ✕
        </button>
      </div>

      {loading && (
        <div className="mt-3 text-sm text-sage-700 dark:text-sage-300">
          Loading comparable sales...
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 rounded bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-700">
          <p className="text-sm text-yellow-900 dark:text-yellow-200">{error}</p>
        </div>
      )}

      {valuation && !loading && (
        <div className="mt-3 space-y-3">
          <div className="bg-white dark:bg-slate-800 p-3 rounded">
            <p className="text-xs text-sage-600 dark:text-sage-400 mb-2">Price Range</p>
            <div className="text-lg font-semibold text-sage-900 dark:text-sage-100">
              {formatPrice(valuation.priceLow)} — {formatPrice(valuation.priceHigh)}
            </div>
            <div className="text-sm text-sage-700 dark:text-sage-300 mt-1">
              Median: <strong>{formatPrice(valuation.priceMedian)}</strong>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <p className="text-xs text-sage-600 dark:text-sage-400 mb-1">Confidence</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-sage-200 dark:bg-sage-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sage-500 dark:bg-sage-400 transition-all"
                    style={{ width: `${valuation.confidenceScore}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-sage-900 dark:text-sage-100">
                  {getConfidenceLevel(valuation.confidenceScore)}
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs text-sage-600 dark:text-sage-400">
            Based on {valuation.comparableCount} recent comparable sales
          </p>

          {onPriceSelect && (
            <div className="pt-2 border-t border-sage-200 dark:border-sage-700 flex gap-2">
              <button
                onClick={() => onPriceSelect(valuation.priceMedian)}
                className="flex-1 px-3 py-2 text-xs font-semibold bg-sage-600 dark:bg-sage-500 text-white rounded hover:bg-sage-700 dark:hover:bg-sage-600 transition"
              >
                Use Median ({formatPrice(valuation.priceMedian)})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
