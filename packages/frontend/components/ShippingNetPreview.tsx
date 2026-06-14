/**
 * ShippingNetPreview — live two-column strip showing estimated buyer shipping and
 * the organizer's estimated net proceeds for an eBay listing. Includes an
 * expandable fee breakdown and a low-price guardrail that warns ONLY when the
 * organizer's entered price is below the fee-safe floor (the point where eBay
 * fees + shipping would eat most of their money).
 *
 * The guardrail is silent on normal items. When it fires, the organizer can
 * accept the floor price — it is never auto-applied.
 * Calls POST /api/ebay/shipping-preview (debounced).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';

interface Breakdown {
  itemPrice: number;
  buyerShipping: number;
  tax: number;
  fvfPercentApplied: number;
  fvfBase: number;
  fvfAmount: number;
  perOrderFee: number;
  promotedFee: number;
  labelCost: number;
  net: number;
}

interface PreviewResponse {
  buyerShipping: number;
  net: number;
  breakdown: Breakdown;
  shippingEstimate: {
    rate: number;
    basis: 'actual' | 'dimensional';
    service: string;
    isEstimate: boolean;
    freeShippingOptIn: boolean;
  };
}

interface ShippingNetPreviewProps {
  itemId?: string;
  itemPrice?: number;
  weightOz?: number;
  dims?: { length?: number; width?: number; height?: number };
  ebayCategoryId?: string | null;
  fromZip?: string | null;
  /** Called when the organizer accepts the suggested floor price. */
  onApplySuggestedPrice?: (price: number) => void;
}

const fmt = (n: number): string => {
  const v = Math.round(n * 100) / 100;
  return v < 0 ? `-$${Math.abs(v).toFixed(2)}` : `$${v.toFixed(2)}`;
};

// The guardrail fires only when the entered price would leave the organizer
// keeping less than this fraction after eBay fees + shipping. Kept low so it
// only warns on genuinely bad prices and stays silent on normal items.
const GUARDRAIL_MARGIN_PCT = 0.15;

export const ShippingNetPreview: React.FC<ShippingNetPreviewProps> = ({
  itemId,
  itemPrice,
  weightOz,
  dims,
  ebayCategoryId,
  fromZip,
  onApplySuggestedPrice,
}) => {
  const [data, setData] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Fee-safe floor price (min item price to keep GUARDRAIL_MARGIN_PCT after fees).
  const [floorPrice, setFloorPrice] = useState<number | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasInputs = !!weightOz && weightOz > 0;

  const fetchPreview = useCallback(async () => {
    if (!hasInputs) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/ebay/shipping-preview', {
        itemId,
        weightOz,
        dims,
        itemPrice,
        ebayCategoryId,
        fromZip,
      });
      setData(res.data as PreviewResponse);

      // Fetch the fee-safe floor for the low-price guardrail (best-effort).
      try {
        const floorRes = await api.post('/ebay/shipping-preview/suggest-price', {
          itemId,
          weightOz,
          dims,
          ebayCategoryId,
          fromZip,
          targetMarginPct: GUARDRAIL_MARGIN_PCT,
        });
        const p = floorRes.data?.suggestedItemPrice;
        setFloorPrice(typeof p === 'number' && isFinite(p) ? p : null);
      } catch {
        setFloorPrice(null);
      }
    } catch (err: any) {
      const code = err.response?.data?.code;
      if (code === 'NEEDS_PACKAGE_DETAILS') {
        setError('Add a package weight to see shipping and net.');
      } else {
        setError('Could not estimate shipping right now.');
      }
      setData(null);
      setFloorPrice(null);
    } finally {
      setLoading(false);
    }
  }, [itemId, weightOz, dims, itemPrice, ebayCategoryId, fromZip, hasInputs]);

  // Debounced refetch when inputs change.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!hasInputs) {
      setData(null);
      setFloorPrice(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      fetchPreview();
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightOz, dims?.length, dims?.width, dims?.height, itemPrice, ebayCategoryId, fromZip]);

  // Empty state — no weight yet.
  if (!hasInputs) {
    return (
      <div className="rounded-lg border border-dashed border-warm-300 dark:border-gray-600 bg-warm-50 dark:bg-gray-800 p-3 text-sm text-warm-600 dark:text-warm-400">
        Add a package weight above to preview buyer shipping and your estimated net.
      </div>
    );
  }

  // Guardrail fires only when a real price is entered AND it sits below the floor.
  const showGuardrail =
    !loading &&
    !!data &&
    floorPrice != null &&
    itemPrice != null &&
    itemPrice > 0 &&
    itemPrice < floorPrice;

  return (
    <div className="rounded-lg border border-warm-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-3 space-y-3">
      {/* Two-column strip */}
      <div className="grid grid-cols-2 gap-3">
        {/* Buyer shipping */}
        <div className="rounded-md bg-warm-50 dark:bg-gray-700 p-3">
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-warm-600 dark:text-warm-400">Buyer pays for shipping</span>
            <span
              className="text-warm-400 dark:text-warm-500 cursor-help text-xs"
              title="eBay calculates the exact rate at checkout from the buyer's ZIP code. This is an estimate."
            >
              ⓘ
            </span>
          </div>
          {loading ? (
            <div className="mt-1 h-6 w-20 rounded bg-warm-200 dark:bg-gray-600 animate-pulse" />
          ) : data && !data.shippingEstimate.freeShippingOptIn ? (
            <>
              <div className="mt-0.5 text-lg font-bold text-warm-900 dark:text-warm-100">
                ~{fmt(data.buyerShipping)}
              </div>
              <div className="text-[11px] text-warm-500 dark:text-warm-400">
                USPS Ground Advantage, est.
              </div>
            </>
          ) : data && data.shippingEstimate.freeShippingOptIn ? (
            <>
              <div className="mt-0.5 text-lg font-bold text-green-700 dark:text-green-300">Free</div>
              <div className="text-[11px] text-warm-500 dark:text-warm-400">You cover ~{fmt(data.shippingEstimate.rate)}</div>
            </>
          ) : (
            <div className="mt-1 text-sm text-warm-500 dark:text-warm-400">—</div>
          )}
        </div>

        {/* Net proceeds */}
        <div className="rounded-md bg-green-50 dark:bg-green-900/30 p-3">
          <span className="text-xs font-medium text-green-700 dark:text-green-300">Your estimated net</span>
          {loading ? (
            <div className="mt-1 h-6 w-20 rounded bg-green-200 dark:bg-green-800 animate-pulse" />
          ) : data ? (
            <>
              <div className="mt-0.5 text-lg font-bold text-green-800 dark:text-green-200">{fmt(data.net)}</div>
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="text-[11px] text-green-700 dark:text-green-300 underline hover:no-underline"
              >
                {expanded ? 'Hide breakdown' : 'See breakdown'}
              </button>
            </>
          ) : (
            <div className="mt-1 text-sm text-warm-500 dark:text-warm-400">—</div>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 rounded px-2 py-1.5">
          {error}
        </div>
      )}

      {/* Expandable breakdown */}
      {expanded && data && (
        <div className="rounded-md bg-warm-50 dark:bg-gray-700 p-3 text-xs space-y-1 text-warm-700 dark:text-warm-300">
          <Row label="Item price" value={fmt(data.breakdown.itemPrice)} />
          <Row label="+ Buyer shipping" value={fmt(data.breakdown.buyerShipping)} />
          <Row
            label={`− eBay fee (${(data.breakdown.fvfPercentApplied * 100).toFixed(1)}%)`}
            value={`−${fmt(data.breakdown.fvfAmount)}`}
            negative
          />
          <Row label="− Per-order fee" value={`−${fmt(data.breakdown.perOrderFee)}`} negative />
          {data.breakdown.promotedFee > 0 && (
            <Row label="− Promoted listing" value={`−${fmt(data.breakdown.promotedFee)}`} negative />
          )}
          <Row label="− Your label cost" value={`−${fmt(data.breakdown.labelCost)}`} negative />
          <div className="border-t border-warm-200 dark:border-gray-600 mt-1 pt-1">
            <Row label="= Your net" value={fmt(data.breakdown.net)} bold />
          </div>
          <p className="text-[11px] text-warm-500 dark:text-warm-400 pt-1">
            Fees include a small safety buffer, so your real net is usually a little higher.
          </p>
        </div>
      )}

      {/* Low-price guardrail — only when the entered price is below the fee-safe floor */}
      {showGuardrail && floorPrice != null && itemPrice != null && data && (
        <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-amber-600 dark:text-amber-400 text-sm leading-none mt-0.5">⚠️</span>
            <div className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
              At <span className="font-bold">{fmt(itemPrice)}</span>, eBay fees and shipping eat
              most of your money — you'd keep only about{' '}
              <span className="font-bold">{fmt(data.net)}</span>. List at{' '}
              <span className="font-bold">{fmt(floorPrice)}</span> or more to keep at least{' '}
              {Math.round(GUARDRAIL_MARGIN_PCT * 100)}% after fees.
            </div>
          </div>
          {onApplySuggestedPrice && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onApplySuggestedPrice(floorPrice)}
                className="px-2 py-1 rounded text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white transition-colors"
              >
                Use {fmt(floorPrice)}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; negative?: boolean; bold?: boolean }> = ({
  label,
  value,
  negative,
  bold,
}) => (
  <div className="flex items-center justify-between">
    <span className={bold ? 'font-semibold' : ''}>{label}</span>
    <span
      className={`${bold ? 'font-bold' : ''} ${
        negative ? 'text-red-600 dark:text-red-400' : 'text-warm-900 dark:text-warm-100'
      }`}
    >
      {value}
    </span>
  </div>
);

export default ShippingNetPreview;
