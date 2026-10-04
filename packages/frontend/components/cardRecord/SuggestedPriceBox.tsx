/**
 * SuggestedPriceBox (ADR-134 3.6, batch B7): shows the catalog price estimate for the card the seller
 * picked, and a "Use suggested price" button.
 *
 * Nothing here changes a price by itself. The estimate is read from GET /api/cards/suggested-price, and
 * the only way a number leaves this component is the seller pressing the button, which calls onUse with
 * the number. The parent then fills the page's Price field; the item still has to be saved. The server
 * does the maths (finish, condition, rounding, staleness); this component only shows the result.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import Skeleton from '../Skeleton';
import useDebouncedValue from './useDebouncedValue';
import {
  CARD_PANEL_COPY,
  CardVocabulary,
  SEARCH_DEBOUNCE_MS,
  SuggestionBody,
  describeSuggestion,
  labelFor,
} from '../../lib/cardRecord';

interface SuggestedPriceBoxProps {
  /** Catalog printing the saved card is linked to. Null until the seller picks a card. */
  printingId: string | null;
  graded: boolean;
  finish: string;
  conditionCode: string;
  language: string;
  vocab: Pick<CardVocabulary, 'finishes' | 'conditionCodes'>;
  /** False when card lookup is switched off, so no request is made. */
  lookupEnabled: boolean;
  busy: boolean;
  onUse: (price: number) => void;
}

const boxCls = 'rounded-lg border border-warm-200 dark:border-gray-600 bg-warm-50 dark:bg-gray-800 px-3 py-3 space-y-2';

const SuggestedPriceBox: React.FC<SuggestedPriceBoxProps> = ({
  printingId,
  graded,
  finish,
  conditionCode,
  language,
  vocab,
  lookupEnabled,
  busy,
  onUse,
}) => {
  const paramsKey = `${finish}|${conditionCode}|${language}`;
  const debouncedKey = useDebouncedValue(paramsKey, SEARCH_DEBOUNCE_MS);
  const [debouncedFinish, debouncedCondition, debouncedLanguage] = debouncedKey.split('|');

  const query = useQuery({
    queryKey: ['card-suggested-price', printingId, debouncedFinish, debouncedCondition, debouncedLanguage],
    queryFn: async (): Promise<SuggestionBody | null> => {
      const params: Record<string, string> = { printingId: printingId as string };
      if (debouncedFinish) params.finish = debouncedFinish;
      if (debouncedCondition) params.conditionCode = debouncedCondition;
      if (debouncedLanguage) params.language = debouncedLanguage;
      const res = await api.get('/cards/suggested-price', { params });
      const body = res.data ?? {};
      const suggestion = body.suggestion ?? body.data?.suggestion ?? null;
      return suggestion as SuggestionBody | null;
    },
    enabled: !!printingId && !graded && lookupEnabled,
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const heading = (
    <h3 className="text-sm font-semibold text-warm-900 dark:text-warm-100">{CARD_PANEL_COPY.suggestedPriceHeading}</h3>
  );

  if (graded) {
    return (
      <div className={boxCls}>
        {heading}
        <p className="text-sm text-warm-700 dark:text-warm-300">{CARD_PANEL_COPY.gradedNoPrice}</p>
      </div>
    );
  }
  if (!lookupEnabled) return null;
  if (!printingId) {
    return (
      <div className={boxCls}>
        {heading}
        <p className="text-sm text-warm-600 dark:text-warm-400">{CARD_PANEL_COPY.suggestedPricePickFirst}</p>
      </div>
    );
  }
  if (query.isLoading || (query.isFetching && !query.data && !query.isError)) {
    return (
      <div className={boxCls} role="status" aria-label={CARD_PANEL_COPY.suggestedPriceLoading}>
        {heading}
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className={boxCls} role="alert">
        {heading}
        <p className="text-sm text-red-700 dark:text-red-300">{CARD_PANEL_COPY.suggestedPriceError}</p>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="min-h-[44px] rounded-lg bg-warm-100 px-4 text-sm font-semibold text-warm-900 hover:bg-warm-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
        >
          {CARD_PANEL_COPY.retry}
        </button>
      </div>
    );
  }

  const view = describeSuggestion(query.data, {
    condition: (code) => labelFor(vocab.conditionCodes, code),
    finish: (code) => labelFor(vocab.finishes, code),
  });

  return (
    <div className={boxCls}>
      {heading}
      {view.price !== null ? (
        <>
          <p className="text-2xl font-bold text-warm-900 dark:text-warm-100" aria-live="polite">
            {view.priceText}
          </p>
          {view.basisText && <p className="text-xs text-warm-600 dark:text-warm-400">{view.basisText}</p>}
          {view.dataDateText && <p className="text-xs text-warm-600 dark:text-warm-400">{view.dataDateText}</p>}
          {view.staleWarning && (
            <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-300">
              {view.staleWarning}
            </p>
          )}
          {view.belowMinimumWarning && (
            <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-300">
              {view.belowMinimumWarning}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => onUse(view.price as number)}
            className="min-h-[44px] w-full rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50 sm:w-auto"
          >
            {CARD_PANEL_COPY.useSuggestedPrice}
          </button>
          <p className="text-xs text-warm-500 dark:text-warm-400">{CARD_PANEL_COPY.priceNeverAuto}</p>
        </>
      ) : (
        <>
          <p className="text-sm text-warm-700 dark:text-warm-300">{view.unavailableText}</p>
          {view.referenceText && <p className="text-xs text-warm-600 dark:text-warm-400">{view.referenceText}</p>}
        </>
      )}
    </div>
  );
};

export default SuggestedPriceBox;
