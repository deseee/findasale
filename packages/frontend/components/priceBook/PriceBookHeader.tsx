/**
 * PriceBookHeader (ADR-140 section 11.1): the title, the one-sentence intro, the On/Off switch for the book and a
 * Settings button. The switch is a real button with role="switch", so it works with keyboard and screen readers.
 */
import React from 'react';
import type { PriceBookView } from '../../lib/priceBook';
import { PRICE_BOOK_COPY } from '../../lib/priceBookCopy';
import { smallBtn } from './ui';

export interface PriceBookHeaderProps {
  book: PriceBookView | null;
  busy: boolean;
  onToggle: (next: boolean) => void;
  onOpenSettings: () => void;
}

const PriceBookHeader: React.FC<PriceBookHeaderProps> = ({ book, busy, onToggle, onOpenSettings }) => {
  const on = !!book && book.enabled;
  return (
    <header className="min-w-0 space-y-3">
      <h1 className="break-words text-2xl font-bold text-warm-900 dark:text-warm-100 sm:text-3xl">{PRICE_BOOK_COPY.title}</h1>
      <p className="text-sm text-warm-700 dark:text-warm-300">{PRICE_BOOK_COPY.pageIntro}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={PRICE_BOOK_COPY.bookSwitchLabel}
          disabled={busy}
          onClick={() => onToggle(!on)}
          className="inline-flex min-h-[44px] items-center gap-3 rounded-lg px-1 text-sm font-semibold text-warm-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50 dark:text-warm-100"
        >
          <span
            aria-hidden="true"
            className={`relative inline-block h-7 w-12 rounded-full transition-colors ${on ? 'bg-amber-600' : 'bg-warm-300 dark:bg-gray-600'}`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`}
            />
          </span>
          <span>{PRICE_BOOK_COPY.bookSwitchLabel}: {on ? PRICE_BOOK_COPY.bookOn : PRICE_BOOK_COPY.bookOff}</span>
        </button>
        <button type="button" onClick={onOpenSettings} disabled={!book} className={smallBtn}>
          {PRICE_BOOK_COPY.settings}
        </button>
      </div>
    </header>
  );
};

export default PriceBookHeader;
