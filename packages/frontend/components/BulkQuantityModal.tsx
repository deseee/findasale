/**
 * BulkQuantityModal (ADR-136, roadmap #659): the register asks "How many cards?" before a bulk lot goes into the cart.
 *
 * The browser does no pricing arithmetic. Each time the number changes (after a short pause) the modal asks the server
 * for the price of exactly that many cards (POST /api/bulk-lots/item/:id/quote) and shows what comes back. "Add to
 * cart" is enabled only when the price on screen is for the number in the box. The server prices the sale again at
 * checkout and refuses it if the total no longer matches, so a stale screen can never charge the wrong amount.
 */
import React, { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import {
  BULK_COPY,
  BulkLot,
  BulkQuote,
  describeBulkError,
  formatCardCount,
  parseCardCount,
} from '../lib/bulkLot';

export interface BulkQuantityModalProps {
  lot: BulkLot;
  onClose: () => void;
  /** Called with the server's quote for the number in the box. */
  onAdd: (quote: BulkQuote) => void;
}

const QUOTE_PAUSE_MS = 350;

const BulkQuantityModal: React.FC<BulkQuantityModalProps> = ({ lot, onClose, onAdd }) => {
  const [text, setText] = useState('');
  const [quote, setQuote] = useState<BulkQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState('');
  const requestSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const cards = parseCardCount(text);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    // Any change to the number invalidates the price on screen.
    requestSeq.current += 1;
    const mySeq = requestSeq.current;
    setQuote(null);
    if (text.trim() === '') {
      setError('');
      setQuoting(false);
      return;
    }
    if (cards === null) {
      setError(BULK_COPY.errorQuantity);
      setQuoting(false);
      return;
    }
    if (cards > lot.remainingCards) {
      setError(BULK_COPY.errorQuantityTooMany);
      setQuoting(false);
      return;
    }
    setError('');
    setQuoting(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.post(`/bulk-lots/item/${encodeURIComponent(lot.itemId)}/quote`, { quantity: cards });
        if (mySeq !== requestSeq.current) return; // a newer number replaced this one
        setQuote(res.data?.data as BulkQuote);
        setQuoting(false);
      } catch (err) {
        if (mySeq !== requestSeq.current) return;
        setQuoting(false);
        setError(describeBulkError(err).message);
      }
    }, QUOTE_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text, cards, lot.itemId, lot.remainingCards]);

  const canAdd = !!quote && cards !== null && quote.cards === cards && !quoting && !error;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-qty-title"
        className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 max-w-sm w-full max-h-[90vh] overflow-y-auto"
      >
        <h2 id="bulk-qty-title" className="text-lg font-bold text-warm-900 dark:text-warm-100">
          {BULK_COPY.regHeading}
        </h2>
        <p className="mt-1 text-sm text-warm-700 dark:text-warm-300">{lot.title}</p>
        <p className="text-xs text-warm-600 dark:text-warm-400">
          {[lot.pricePerThousandLabel, lot.remainingLabel].filter(Boolean).join('. ')}
        </p>

        <label htmlFor="bulk-qty-input" className="mt-4 block text-sm font-medium text-warm-700 dark:text-warm-300">
          {BULK_COPY.regQuantityLabel}
        </label>
        <input
          id="bulk-qty-input"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={BULK_COPY.regQuantityPlaceholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'bulk-qty-error' : undefined}
          className="w-full min-h-[44px] px-4 py-2 text-base border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none"
        />

        {lot.ladder.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-warm-600 dark:text-warm-400 mb-1">{BULK_COPY.regQuickLabel}</p>
            <div className="flex flex-wrap gap-2">
              {lot.ladder.map((row) => (
                <button
                  key={row.cards}
                  type="button"
                  onClick={() => setText(String(row.cards))}
                  className="min-h-[44px] rounded-lg bg-warm-100 px-3 text-sm font-semibold text-warm-900 hover:bg-warm-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                >
                  {row.isAll ? `${BULK_COPY.regAllLabel} ${row.cardsLabel}` : row.cardsLabel}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 min-h-[3rem]" aria-live="polite">
          {error && (
            <p id="bulk-qty-error" role="alert" className="text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          {!error && quoting && <p className="text-sm text-warm-600 dark:text-warm-400">{BULK_COPY.regChecking}</p>}
          {!error && !quoting && quote && cards !== null && quote.cards === cards && (
            <p className="text-base font-semibold text-warm-900 dark:text-warm-100">
              {formatCardCount(quote.cards)} {BULK_COPY.regCardsSuffix}: ${quote.amount.toFixed(2)}
            </p>
          )}
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 font-semibold py-2 px-4 rounded-lg transition-colors"
          >
            {BULK_COPY.regCancel}
          </button>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => {
              if (canAdd && quote) onAdd(quote);
            }}
            className="flex-1 min-h-[44px] font-semibold py-2 px-4 rounded-lg transition-colors text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {BULK_COPY.regAdd}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BulkQuantityModal;
