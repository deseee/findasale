/**
 * ChangesTab (ADR-140 section 11.5): "Reprice my cards" with a preview and undo. A short explanation, two start buttons
 * (cards and bulk lots), the four-step RepriceStepper while a run is open, and the history of recent runs below it.
 * "Apply to my bulk lots" on the Bulk rates tab opens this tab with a lot run ready to preview (launchKind).
 */
import React, { useEffect, useId, useState } from 'react';
import type { PriceBookStatus, PriceBookView } from '../../lib/priceBook';
import { PRICE_BOOK_COPY, PRICE_BOOK_UI } from '../../lib/priceBookCopy';
import type { UnpricedPreset } from '../../lib/priceBookWiring';
import RepriceStepper, { scopeFormFromPreset } from './RepriceStepper';
import type { StepperKind } from './RepriceStepper';
import RunHistory from './RunHistory';
import { mutedCls, primaryBtn, sectionCls, secondaryBtn, subHeadingCls } from './ui';
import { useRefreshPriceBook } from './usePriceBookData';

export interface ChangesTabProps {
  book: PriceBookView;
  status: PriceBookStatus;
  /** Set by the page when the Bulk rates tab asked for a lot run. */
  launchKind?: StepperKind | null;
  onLaunched?: () => void;
  /** Set by the page when the URL came from "Price the cards without a price" (ADR-140 section 12.4). Opens a card run at the scope step. */
  preset?: UnpricedPreset | null;
}

const ChangesTab: React.FC<ChangesTabProps> = ({ book, status, launchKind, onLaunched, preset }) => {
  const baseId = useId();
  const refresh = useRefreshPriceBook();
  const [presetScope, setPresetScope] = useState<UnpricedPreset | null>(preset || null);
  const [active, setActive] = useState<StepperKind | null>(preset ? 'BULK' : null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (launchKind) {
      setActive(launchKind);
      setNonce((n) => n + 1);
      if (onLaunched) onLaunched();
    }
  }, [launchKind, onLaunched]);

  const titleId = `${baseId}-title`;

  return (
    <div className="space-y-6">
      {active === null ? (
        <section aria-labelledby={titleId} className={sectionCls}>
          <h2 id={titleId} className={subHeadingCls}>{PRICE_BOOK_COPY.changesHeading}</h2>
          <p className={mutedCls}>{PRICE_BOOK_UI.changesIntro}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className={primaryBtn} onClick={() => setActive('BULK')}>{PRICE_BOOK_COPY.changesHeading}</button>
            <button type="button" className={secondaryBtn} onClick={() => setActive('LOT')}>{PRICE_BOOK_UI.repriceLots}</button>
          </div>
        </section>
      ) : (
        <RepriceStepper
          key={`${active}-${nonce}`}
          kind={active}
          book={book}
          initialScope={presetScope && active === 'BULK' ? scopeFormFromPreset(presetScope) : undefined}
          onClose={() => {
            setActive(null);
            setPresetScope(null);
          }}
          onFinished={() => void refresh()}
        />
      )}
      <RunHistory status={status} />
    </div>
  );
};

export default ChangesTab;
