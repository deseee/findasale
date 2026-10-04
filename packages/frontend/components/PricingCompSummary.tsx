import React, { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import {
  COMP_COPY,
  buildEstimateBody,
  canRunEstimate,
  estimateErrorMessage,
  formatRangeText,
  parseEstimateResponse,
  type ParsedEstimate,
} from '../lib/pricingCompFormat';

interface CompSummaryData {
  sourceCount: number;
  medianLow: number | null;
  medianHigh: number | null;
  lastUpdated: string | null;
}

interface PricingCompSummaryProps {
  itemId: string;
  /** Item title. A lookup needs a title or a category; with neither, the lookup button is not shown. */
  itemTitle?: string;
  /** Run the lookup once on mount (old behavior). Default false: the lookup only runs when the organizer taps the button. */
  autoRun?: boolean;
  /** The item's real condition (NEW, USED, REFURBISHED, PARTS_OR_REPAIR). Sent as given, never guessed. */
  condition?: string;
  /** The item's real condition grade (A, B, C, D). Sent as given, never guessed. */
  conditionGrade?: string;
  /** Optional extra context for a better lookup. Sent only when provided. */
  category?: string;
  brand?: string;
}

/**
 * PricingCompSummary — Feature #338: Sold-price comp callout near the price field
 *
 * Behavior (Wave 3):
 * - On mount, only READS the cached comp summary from GET /items/:id/comp-summary
 *   ("Based on N sources, median $X to $Y"). Nothing is written and no market lookup runs.
 * - The lookup is user-initiated: the "Look up comparable prices" button sends
 *   POST /pricing/estimate with persist:false, so a what-if lookup never overwrites the saved estimate.
 *   The item's real condition and conditionGrade are sent when the page passes them.
 * - When a grade factor was applied, one muted line discloses it ("Adjusted for grade C (x0.85).").
 * - This component only displays. It never fills in or changes any price field.
 * - `autoRun` runs the same lookup once on mount for a caller that wants it.
 * - Dark mode compatible
 */
const PricingCompSummary: React.FC<PricingCompSummaryProps> = ({
  itemId,
  itemTitle,
  autoRun = false,
  condition,
  conditionGrade,
  category,
  brand,
}) => {
  const [compData, setCompData] = useState<CompSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [estimate, setEstimate] = useState<ParsedEstimate | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  // Blocks a second request while one is in flight (double tap, StrictMode double-mount).
  const inFlight = useRef(false);
  const autoRunDone = useRef(false);

  const canLookup = canRunEstimate({ title: itemTitle, category });

  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;
    const loadCached = async () => {
      try {
        const response = await api.get(`/items/${itemId}/comp-summary`);
        if (!cancelled) setCompData(response.data as CompSummaryData);
      } catch {
        if (!cancelled) setCompData(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadCached();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const runLookup = async () => {
    if (inFlight.current || !itemId || !canLookup) return;
    inFlight.current = true;
    setIsFetching(true);
    setLookupError(null);
    try {
      const body = buildEstimateBody({ itemId, title: itemTitle, category, brand, condition, conditionGrade });
      const response = await api.post('/pricing/estimate', body);
      setEstimate(parseEstimateResponse(response.data));
    } catch (err) {
      setEstimate(null);
      setLookupError(estimateErrorMessage(err));
    } finally {
      inFlight.current = false;
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (!autoRun || autoRunDone.current || !itemId || !canLookup) return;
    autoRunDone.current = true;
    void runLookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, itemId, canLookup]);

  // While initially loading the cached summary, render nothing (no flash)
  if (isLoading) {
    return null;
  }

  const hasCached = !!compData && compData.sourceCount > 0;

  // Nothing to show and nothing the organizer can do: render nothing (graceful no-op)
  if (!hasCached && !canLookup && !estimate && !lookupError) {
    return null;
  }

  const sourceText = compData && compData.sourceCount === 1 ? 'source' : 'sources';
  const priceRangeText =
    compData && compData.medianLow !== null && compData.medianHigh !== null
      ? `, median ${formatRangeText(compData.medianLow, compData.medianHigh)}`
      : '';

  const buttonLabel = isFetching
    ? COMP_COPY.buttonPending
    : estimate || lookupError
      ? COMP_COPY.buttonAgain
      : COMP_COPY.button;

  return (
    <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
      {hasCached && compData && (
        <p className="text-sm text-amber-900 dark:text-amber-100">
          <span className="font-medium">
            Based on {compData.sourceCount} {sourceText}{priceRangeText}
          </span>
        </p>
      )}

      <div aria-live="polite">
        {isFetching && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{COMP_COPY.pendingNote}</p>
        )}
        {!isFetching && lookupError && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{lookupError}</p>
        )}
        {!isFetching && estimate?.kind === 'none' && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{COMP_COPY.none}</p>
        )}
        {!isFetching && estimate?.kind === 'ok' && (
          <>
            <p className="mt-1 text-sm text-amber-900 dark:text-amber-100">
              <span className="font-medium">
                Based on {estimate.compsFound} comparable {estimate.compsFound === 1 ? 'listing' : 'listings'},{' '}
                typically {formatRangeText(estimate.low, estimate.high)}
              </span>
            </p>
            {estimate.gradeLine && (
              <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-300/80">{estimate.gradeLine}</p>
            )}
          </>
        )}
      </div>

      {canLookup && (
        <button
          type="button"
          onClick={() => void runLookup()}
          disabled={isFetching}
          aria-busy={isFetching}
          className="mt-1 inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm font-medium text-amber-800 hover:underline disabled:opacity-60 disabled:no-underline dark:text-amber-200"
        >
          {buttonLabel}
        </button>
      )}
    </div>
  );
};

export default PricingCompSummary;
