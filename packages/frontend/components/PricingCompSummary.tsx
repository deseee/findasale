import React, { useEffect, useState } from 'react';
import api from '../lib/api';

interface CompSummaryData {
  sourceCount: number;
  medianLow: number | null;
  medianHigh: number | null;
  lastUpdated: string | null;
}

interface PricingCompSummaryProps {
  itemId: string;
}

/**
 * PricingCompSummary — Display multi-source pricing comp data
 *
 * Shows a single-line informational summary:
 * "Price data from N sources — median $X–$Y · Last updated [date]"
 *
 * Features:
 * - Fetches comp summary on mount
 * - Dark mode compatible
 * - Subtle amber/sage styling (consistent with EncyclopediaInlineTip)
 * - Returns null if no data exists or while loading (no skeleton)
 */
const PricingCompSummary: React.FC<PricingCompSummaryProps> = ({ itemId }) => {
  const [compData, setCompData] = useState<CompSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCompSummary = async () => {
      try {
        const response = await api.get(`/items/${itemId}/comp-summary`);
        setCompData(response.data);
      } catch (error) {
        // Silently fail — comp data is optional
        setCompData(null);
      } finally {
        setIsLoading(false);
      }
    };

    if (itemId) {
      fetchCompSummary();
    }
  }, [itemId]);

  // No data — render nothing
  if (isLoading || !compData || compData.sourceCount === 0) {
    return null;
  }

  // If no median price range, still show source count
  const sourceText = compData.sourceCount === 1 ? 'source' : 'sources';
  const priceRangeText =
    compData.medianLow !== null && compData.medianHigh !== null
      ? ` — median $${compData.medianLow.toFixed(2)}–$${compData.medianHigh.toFixed(2)}`
      : '';

  // Format last updated date
  const lastUpdatedText = compData.lastUpdated
    ? ` · Last updated ${new Date(compData.lastUpdated).toLocaleDateString()}`
    : '';

  return (
    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
      <p className="text-sm text-amber-900 dark:text-amber-100">
        <span className="font-medium">
          Price data from {compData.sourceCount} {sourceText}
        </span>
        {priceRangeText}
        {lastUpdatedText}
      </p>
    </div>
  );
};

export default PricingCompSummary;
