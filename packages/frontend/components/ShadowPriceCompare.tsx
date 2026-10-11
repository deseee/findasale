import React from 'react';

export interface ShadowPricing {
  /** The model's own suggestion in dollars (null when it was not recorded). */
  smartPrice?: number | null;
  /** Saved market (pricing engine) estimate in dollars. */
  marketPrice?: number | null;
  marketConfidence?: string | null;
  /** How many comparable listings the market estimate is based on. */
  compsFound?: number | null;
}

interface ShadowPriceCompareProps {
  shadowPricing: ShadowPricing | null | undefined;
  className?: string;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Shadow-mode price comparison (2026-10-11): shows the model's own suggestion next to the market estimate so the
 * organizer can judge which one tracks reality. Display only: it never fills in or changes any price field.
 * The market estimate renders only when one is saved, and is worded as a reference, not an authority.
 */
const ShadowPriceCompare: React.FC<ShadowPriceCompareProps> = ({ shadowPricing, className }) => {
  const market = shadowPricing?.marketPrice;
  if (typeof market !== 'number' || !isFinite(market) || market <= 0) return null;
  const smart = shadowPricing?.smartPrice;
  const hasSmart = typeof smart === 'number' && isFinite(smart) && smart > 0;
  const comps = typeof shadowPricing?.compsFound === 'number' ? shadowPricing.compsFound : 0;

  return (
    <div
      className={`p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg space-y-1 ${className ?? ''}`}
      data-testid="shadow-price-compare"
    >
      {hasSmart && (
        <p className="text-xs text-amber-900 dark:text-amber-100">
          <span className="text-amber-700 dark:text-amber-300">Smart suggestion </span>
          <span className="font-semibold">{money(smart as number)}</span>
        </p>
      )}
      <p className="text-xs text-amber-900 dark:text-amber-100">
        <span className="text-amber-700 dark:text-amber-300">Market estimate </span>
        <span className="font-semibold">{money(market)}</span>
        {comps > 0 && (
          <span className="text-amber-700 dark:text-amber-300">
            {' '}(based on {comps} similar {comps === 1 ? 'listing' : 'listings'})
          </span>
        )}
      </p>
      <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
        For reference only. Your price is not changed.
      </p>
    </div>
  );
};

export default ShadowPriceCompare;
