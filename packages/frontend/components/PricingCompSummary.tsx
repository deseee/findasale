import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';

interface CompSummaryData {
  sourceCount: number;
  medianLow: number | null;
  medianHigh: number | null;
  lastUpdated: string | null;
}

interface PricingCompSummaryProps {
  itemId: string;
  /** Item title — when provided and no cached comp data exists, auto-triggers a fresh comps fetch */
  itemTitle?: string;
}

/**
 * PricingCompSummary — Feature #338: Sold-price comp callout near the price field
 *
 * Shows a compact informational summary automatically on page load:
 * "Based on N sources, median $X–$Y"
 *
 * Behavior:
 * - On mount, fetches cached comp summary from /items/:id/comp-summary
 * - If no cached data exists AND itemTitle is provided, triggers a fresh eBay comps fetch
 *   via POST /items/:id/comps, then re-fetches the summary
 * - Shows a subtle loading indicator only during the auto-fetch (not on initial load)
 * - Returns null if fetch fails or returns no usable data (graceful no-op)
 * - Dark mode compatible
 */
const PricingCompSummary: React.FC<PricingCompSummaryProps> = ({ itemId, itemTitle }) => {
  const [compData, setCompData] = useState<CompSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  // Prevent double-trigger on StrictMode double-mount
  const fetchTriggered = useRef(false);

  const fetchCompSummary = async (): Promise<CompSummaryData | null> => {
    try {
      const response = await api.get(`/items/${itemId}/comp-summary`);
      return response.data as CompSummaryData;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!itemId) return;

    const run = async () => {
      // Step 1: fetch cached summary
      const cached = await fetchCompSummary();
      setCompData(cached);
      setIsLoading(false);

      // Step 2: if no data and we have a title, auto-trigger a fresh comps fetch
      if (
        (!cached || cached.sourceCount === 0) &&
        itemTitle &&
        itemTitle.trim().length > 0 &&
        !fetchTriggered.current
      ) {
        fetchTriggered.current = true;
        setIsFetching(true);
        try {
          await api.post(`/items/${itemId}/comps`);
          // Re-fetch summary — comps job may have populated ItemCompLookup
          const refreshed = await fetchCompSummary();
          setCompData(refreshed);
        } catch {
          // Silently ignore — comps fetch is best-effort
        } finally {
          setIsFetching(false);
        }
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // While initially loading summary — render nothing (no flash)
  if (isLoading) {
    return null;
  }

  // Auto-fetching fresh comps — show a subtle indicator
  if (isFetching) {
    return (
      <div className="mt-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Looking up recent sold prices…
        </p>
      </div>
    );
  }

  // No usable data — render nothing
  if (!compData || compData.sourceCount === 0) {
    return null;
  }

  // Build display text
  const sourceText = compData.sourceCount === 1 ? 'source' : 'sources';
  const priceRangeText =
    compData.medianLow !== null && compData.medianHigh !== null
      ? `, median $${compData.medianLow.toFixed(2)}–$${compData.medianHigh.toFixed(2)}`
      : '';

  return (
    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
      <p className="text-sm text-amber-900 dark:text-amber-100">
        <span className="font-medium">
          Based on {compData.sourceCount} {sourceText}{priceRangeText}
        </span>
      </p>
    </div>
  );
};

export default PricingCompSummary;
