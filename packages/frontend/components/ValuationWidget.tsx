import React, { useState } from 'react';
import api from '../lib/api';
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

  // Check if organizer is PRO or TEAMS tier
  const isPro = user?.organizerTier === 'PRO' || user?.organizerTier === 'TEAMS';

  if (!isPro) {
    return (
      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-200 mb-2.5">
          📊 Compare Against FindA.Sale Sales Data
        </p>
        <p className="text-xs text-amber-800 dark:text-amber-300 mb-3">
          See price ranges from recent sales on the platform. Upgrade to PRO to unlock.
        </p>
        <a
          href="/pricing"
          className="inline-flex items-center px-3 py-1.5 border border-amber-500 text-amber-600 dark:text-amber-400 dark:border-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-xs font-medium rounded-lg transition-colors"
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
      const { data } = await api.get(`/items/${itemId}/valuation`);
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
      <div className="py-1.5">
        <button
          onClick={() => {
            setShowWidget(true);
            loadValuation();
          }}
          disabled={loading}
          className="px-3 py-1.5 border border-[#4A7C59] dark:border-[#4A7C59] text-[#4A7C59] dark:text-[#4A7C59] hover:bg-amber-50 dark:hover:bg-amber-900/20 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Load Comparable Sales'}
        </button>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Sales Comps Results</h3>
        <button
          onClick={() => setShowWidget(false)}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          ✕
        </button>
      </div>

      {loading && (
        <div className="text-sm text-gray-700 dark:text-gray-300">
          Fetching comparable sales...
        </div>
      )}

      {error && (
        <div className="p-3 rounded bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700">
          <p className="text-sm text-yellow-900 dark:text-yellow-200">{error}</p>
        </div>
      )}

      {valuation && !loading && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Price Range</p>
            <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {formatPrice(valuation.priceLow)} — {formatPrice(valuation.priceHigh)}
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-300 mt-1">
              Median: <strong>{formatPrice(valuation.priceMedian)}</strong>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Confidence</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 dark:bg-green-400 transition-all"
                  style={{ width: `${valuation.confidenceScore}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                {getConfidenceLevel(valuation.confidenceScore)}
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-600 dark:text-gray-400">
            Based on {valuation.comparableCount} recent comparable sales
          </p>

          {onPriceSelect && (
            <button
              onClick={() => onPriceSelect(valuation.priceMedian)}
              className="w-full px-3 py-2 text-xs font-semibold bg-[#4A7C59] dark:bg-[#4A7C59] hover:bg-[#3d654a] dark:hover:bg-[#3d654a] text-white rounded-lg transition"
            >
              Use ${formatPrice(valuation.priceMedian).slice(1)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
