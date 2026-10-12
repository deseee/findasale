/**
 * SuggestedPriceLookup (ADR-138 batch B7): an opt-in look-up of the suggested price for one card (GET /api/cards/suggested-price).
 * It asks only when the seller taps the button, so a long list of cards does not send a long list of requests. Nothing here
 * changes a price: the number reaches the card only when the seller taps "Use suggested price".
 */
import React, { useCallback, useEffect, useState } from 'react';
import api from '../../lib/api';
import { describeSuggestion, formatMoney } from '../../lib/cardRecord';
import type { SuggestionBody } from '../../lib/cardRecord';
import { SCAN_COPY } from '../../lib/cardScanCopy';
import { mutedCls, secondaryBtn, smallBtn } from './ui';

type Phase = 'idle' | 'loading' | 'ready' | 'none' | 'error';

export interface SuggestedPriceLookupProps {
  printingId: string;
  finish: string | null;
  conditionCode: string | null;
  disabled?: boolean;
  onUse: (price: number) => void;
}

const plain = (code: string): string => code;

const SuggestedPriceLookup: React.FC<SuggestedPriceLookupProps> = ({ printingId, finish, conditionCode, disabled, onUse }) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [price, setPrice] = useState<number | null>(null);

  // A different printing, finish or condition makes an earlier answer out of date.
  useEffect(() => {
    setPhase('idle');
    setPrice(null);
  }, [printingId, finish, conditionCode]);

  const lookup = useCallback(async () => {
    setPhase('loading');
    try {
      const params: Record<string, string> = { printingId };
      if (finish) params.finish = finish;
      if (conditionCode) params.conditionCode = conditionCode;
      const res = await api.get('/cards/suggested-price', { params });
      const body = res.data || {};
      const suggestion = (body.suggestion || (body.data ? body.data.suggestion : null) || null) as SuggestionBody | null;
      const view = describeSuggestion(suggestion, { condition: plain, finish: plain });
      if (view.price === null) {
        setPhase('none');
        return;
      }
      setPrice(view.price);
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, [printingId, finish, conditionCode]);

  if (phase === 'loading') {
    return (
      <p role="status" className={mutedCls}>
        {SCAN_COPY.suggestedPriceLoading}
      </p>
    );
  }
  if (phase === 'ready' && price !== null) {
    return (
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <p className={mutedCls}>{SCAN_COPY.suggestedPriceValue(formatMoney(price))}</p>
        <button type="button" disabled={disabled} onClick={() => onUse(price)} className={secondaryBtn}>
          {SCAN_COPY.useSuggestedPrice}
        </button>
      </div>
    );
  }
  if (phase === 'none') {
    return <p className={mutedCls}>{SCAN_COPY.suggestedPriceNone}</p>;
  }
  if (phase === 'error') {
    return (
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <p className={mutedCls}>{SCAN_COPY.suggestedPriceError}</p>
        <button type="button" onClick={() => void lookup()} className={smallBtn}>
          {SCAN_COPY.sendRetry}
        </button>
      </div>
    );
  }
  return (
    <button type="button" disabled={disabled} onClick={() => void lookup()} className={smallBtn}>
      {SCAN_COPY.suggestedPrice}
    </button>
  );
};

export default SuggestedPriceLookup;
