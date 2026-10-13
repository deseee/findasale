/**
 * StartCard (ADR-140 section 11.1): the three-step start card shown while the shop's book does not exist yet or is still off.
 * Step 1 learns the shop's current prices (5.4), step 2 adds a starting rule (the retail starter template), step 3 turns the
 * book on. Every step is optional and nothing is turned on until step 3. The first step that needs a book creates it (off).
 */
import React, { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { priceBookApi, readPriceBookError } from '../../lib/priceBook';
import type { PriceBookView } from '../../lib/priceBook';
import { PRICE_BOOK_COPY, PRICE_BOOK_UI } from '../../lib/priceBookCopy';
import { UseCurrentPricesButton } from './ReferenceTable';
import { cardCls, mutedCls, noticeErrorCls, noticeOkCls, primaryBtn, secondaryBtn, subHeadingCls } from './ui';

export interface StartCardProps {
  /** The shop's book, or null before the first write. */
  book: PriceBookView | null;
  onChanged: () => void;
}

const StartCard: React.FC<StartCardProps> = ({ book, onChanged }) => {
  const titleId = useId();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const ensureBook = async (): Promise<void> => {
    if (!book) await priceBookApi.putBook({ enabled: false });
  };

  const starter = useMutation({
    mutationFn: async () => {
      await ensureBook();
      return priceBookApi.applyTemplate('RETAIL_STARTER');
    },
    onSuccess: () => {
      setError('');
      setMessage(PRICE_BOOK_UI.startStarterDone);
      onChanged();
    },
    onError: (err) => {
      setMessage('');
      setError(readPriceBookError(err).message);
      onChanged();
    },
  });

  const turnOn = useMutation({
    mutationFn: () => priceBookApi.putBook({ enabled: true }, book ? book.version : null),
    onSuccess: () => {
      setError('');
      onChanged();
    },
    onError: (err) => {
      setMessage('');
      setError(readPriceBookError(err).message);
      onChanged();
    },
  });

  const busy = starter.isPending || turnOn.isPending;

  return (
    <section aria-labelledby={titleId} className={`${cardCls} min-w-0 space-y-4`}>
      <h2 id={titleId} className={subHeadingCls}>{PRICE_BOOK_COPY.startHeading}</h2>
      <p className={mutedCls}>{PRICE_BOOK_COPY.startOptional}</p>
      <ol className="space-y-5">
        <li className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">{PRICE_BOOK_UI.startStepNumber(1, PRICE_BOOK_COPY.startStepCurrent)}</p>
          <UseCurrentPricesButton ensureBook={ensureBook} onDone={onChanged} />
        </li>
        <li className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">{PRICE_BOOK_UI.startStepNumber(2, PRICE_BOOK_COPY.startStepRule)}</p>
          <p className={mutedCls}>{PRICE_BOOK_COPY.starterLabel}</p>
          <button type="button" className={secondaryBtn} disabled={busy} onClick={() => starter.mutate()}>
            {starter.isPending ? PRICE_BOOK_UI.working : PRICE_BOOK_COPY.addStarter}
          </button>
        </li>
        <li className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-warm-900 dark:text-warm-100">{PRICE_BOOK_UI.startStepNumber(3, PRICE_BOOK_COPY.startStepOn)}</p>
          <button type="button" className={primaryBtn} disabled={busy} onClick={() => turnOn.mutate()}>
            {turnOn.isPending ? PRICE_BOOK_UI.working : PRICE_BOOK_COPY.startStepOn}
          </button>
        </li>
      </ol>
      <div aria-live="polite" className="space-y-2">
        {message && <p role="status" className={noticeOkCls}>{message}</p>}
        {error && <p role="alert" className={noticeErrorCls}>{error}</p>}
      </div>
    </section>
  );
};

export default StartCard;
