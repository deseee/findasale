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
import type { WhyThisPriceView } from '../../lib/priceBookRules';
import WhyThisPrice from '../priceBook/WhyThisPrice'; // ADR-140 (B8): renders only when the answer carries a priceBook block
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
  // ADR-140 (B8): empty unless the answer came from the shop's price book.
  const [provenance, setProvenance] = useState('');
  const [why, setWhy] = useState<WhyThisPriceView | null>(null);
  const [noneText, setNoneText] = useState('');

  // A different printing, finish or condition makes an earlier answer out of date.
  useEffect(() => {
    setPhase('idle');
    setPrice(null);
    setProvenance('');
    setWhy(null);
    setNoneText('');
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
        setNoneText(view.whyThisPrice ? view.unavailableText : '');
        setPhase('none');
        return;
      }
      setPrice(view.price);
      setProvenance(view.provenanceText);
      setWhy(view.whyThisPrice);
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
    const row = (
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <p className={mutedCls}>{SCAN_COPY.suggestedPriceValue(formatMoney(price))}</p>
        <button type="button" disabled={disabled} onClick={() => onUse(price)} className={secondaryBtn}>
          {SCAN_COPY.useSuggestedPrice}
        </button>
      </div>
    );
    if (!provenance && !why) return row;
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {row}
        {provenance && <p className={mutedCls}>{provenance}</p>}
        {why && <WhyThisPrice view={why} />}
      </div>
    );
  }
  if (phase === 'none') {
    return <p className={mutedCls}>{noneText || SCAN_COPY.suggestedPriceNone}</p>;
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
