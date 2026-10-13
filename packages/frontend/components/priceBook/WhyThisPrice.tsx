/**
 * WhyThisPrice (ADR-140 section 11.6): a button that opens an inline "Why this price" panel.
 *
 * The panel shows only what the server sent (source label and date, rule, steps, warnings, lock note, plain-words why). It
 * computes nothing. The button has aria-expanded and aria-controls, the panel is not hover-only, and Escape closes it and
 * puts focus back on the button.
 */
import React, { useCallback, useId, useRef, useState } from 'react';
import type { PriceBookResultBlock } from '../../lib/priceBook';
import { PRICE_BOOK_COPY } from '../../lib/priceBookCopy';
import { buildWhyThisPrice } from '../../lib/priceBookRules';
import type { WhyThisPriceView } from '../../lib/priceBookRules';
import { smallBtn } from './ui';

export interface WhyThisPriceProps {
  /** The price book block of a suggestion (or a run row turned into one). */
  block?: PriceBookResultBlock | null;
  /** A view that was already built from a block. Wins over block. */
  view?: WhyThisPriceView | null;
  defaultOpen?: boolean;
  className?: string;
}

const WhyThisPrice: React.FC<WhyThisPriceProps> = ({ block, view, defaultOpen = false, className }) => {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const [open, setOpen] = useState(defaultOpen);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const model: WhyThisPriceView | null = view !== undefined && view !== null ? view : buildWhyThisPrice(block);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape' && open) {
        e.stopPropagation();
        setOpen(false);
        if (buttonRef.current) buttonRef.current.focus();
      }
    },
    [open]
  );

  if (!model) return null;

  const row = 'text-sm text-warm-800 dark:text-warm-200';
  const label = 'text-xs font-semibold uppercase tracking-wide text-warm-500 dark:text-warm-400';

  return (
    <div className={`min-w-0 ${className || ''}`} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={smallBtn}
      >
        {model.buttonLabel}
      </button>
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={model.buttonLabel}
          className="mt-2 space-y-3 rounded-lg border border-warm-200 bg-warm-50 p-3 dark:border-gray-600 dark:bg-gray-900"
        >
          <p className="break-words text-base font-semibold text-warm-900 dark:text-warm-100">{model.headline}</p>
          {model.lockedText && (
            <p className="break-words rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
              {model.lockedText}
            </p>
          )}
          {model.basedOn && (
            <div>
              <p className={label}>{PRICE_BOOK_COPY.whyBasedOn}</p>
              <p className={`${row} break-words`}>{model.basedOn}</p>
              {model.referenceText && <p className={`${row} break-words`}>{model.referenceText}</p>}
            </div>
          )}
          {model.ruleText && (
            <div>
              <p className={label}>{PRICE_BOOK_COPY.whyRule}</p>
              <p className={`${row} break-words`}>{model.ruleText}</p>
            </div>
          )}
          {model.traceLines.length > 0 && (
            <div>
              <p className={label}>{PRICE_BOOK_COPY.whySteps}</p>
              <ol className="list-decimal space-y-1 pl-5">
                {model.traceLines.map((line, i) => (
                  <li key={`${i}-${line}`} className={`${row} break-words`}>
                    {line}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {(model.warnings.length > 0 || model.reviewNotes.length > 0) && (
            <div>
              <p className={label}>{PRICE_BOOK_COPY.whyWarnings}</p>
              <ul className="list-disc space-y-1 pl-5">
                {model.warnings.concat(model.reviewNotes).map((w, i) => (
                  <li key={`${i}-${w}`} className={`${row} break-words`}>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {model.why && <p className={`${row} break-words`}>{model.why}</p>}
        </div>
      )}
    </div>
  );
};

export default WhyThisPrice;
