/**
 * EbayFeeCheckBadge: shared pre-flight eBay insertion-fee indicator.
 *
 * Extracted from PostSaleEbayPanel.tsx so the same "would pushing this item
 * live to eBay incur a real insertion fee?" badge can be rendered from both
 * the post-sale push panel and the edit-item eBay publish flow, without
 * duplicating the useQuery/endpoint logic.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import {
  FEE_CHECK_COPY,
  classifyFeeCheckError,
  parseFeeCheckResponse,
  type EbayFeeCheckResult,
  type ParsedFeeCheck,
} from '../lib/ebayFeeCheckParse';

// Mirrors EbayFeeCheckResult in packages/backend/src/lib/ebayListingFeeCheck.ts.
export type { EbayFeeCheckResult };

// Pre-flight eBay insertion-fee visibility. The check is strictly user-initiated (Wave 3):
// it never fires on mount. The organizer taps "Check eBay fees" and the check runs once; the
// button is disabled while the request is pending so a double tap cannot send two. Pass
// `autoRun` to keep the old run-when-enabled behavior for a caller that really wants it.
// `enabled` still gates the whole badge (false renders nothing and never fetches).
// The backend answers 200 { ready:false, reasons } for items that cannot be checked yet
// (no eBay offer, already listed, temporarily unavailable): that is shown as a message, not an error.
// staleTime: Infinity + retry: false + no focus/reconnect refetch -- a result stays until the
// organizer asks again, and a failure is never silently retried against eBay's live API.
export const EbayFeeCheckBadge: React.FC<{ itemId: string; enabled: boolean; autoRun?: boolean }> = ({
  itemId,
  enabled,
  autoRun = false,
}) => {
  const { data, isFetching, isError, error, refetch } = useQuery<ParsedFeeCheck>({
    queryKey: ['ebay-fee-check', itemId],
    queryFn: async () => {
      const response = await api.post(`/ebay/organizer/items/${itemId}/ebay-fee-check`);
      return parseFeeCheckResponse(response.data);
    },
    // Disabled queries can still be run on demand with refetch(); that is the user-initiated path.
    enabled: enabled && autoRun,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });

  if (!enabled) return null;

  const handleCheck = () => {
    if (isFetching) return;
    // cancelRefetch: false -> a second tap while a request is in flight reuses it instead of restarting it.
    void refetch({ cancelRefetch: false });
  };

  const renderButton = (label: string) => (
    <button
      type="button"
      onClick={handleCheck}
      disabled={isFetching}
      aria-busy={isFetching}
      className="mt-1 inline-flex min-h-[44px] items-center rounded-lg px-2 text-xs font-medium text-blue-700 hover:underline disabled:opacity-60 disabled:no-underline dark:text-blue-400"
    >
      {label}
    </button>
  );

  let body: React.ReactNode;

  if (isFetching) {
    body = (
      <>
        <p className="text-[11px] text-warm-500 dark:text-warm-400 italic mt-1">Checking eBay listing fee…</p>
        {renderButton(FEE_CHECK_COPY.buttonPending)}
      </>
    );
  } else if (isError) {
    const failure = classifyFeeCheckError(error);
    body = (
      <>
        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">{failure.message}</p>
        {renderButton(FEE_CHECK_COPY.buttonAgain)}
      </>
    );
  } else if (data === undefined) {
    // Nothing requested yet: just the button.
    body = renderButton(FEE_CHECK_COPY.button);
  } else if (data.kind === 'not_ready') {
    body = (
      <>
        <p className="text-[11px] text-warm-600 dark:text-warm-300 mt-1">{data.message}</p>
        {renderButton(FEE_CHECK_COPY.buttonAgain)}
      </>
    );
  } else if (data.kind === 'invalid') {
    body = (
      <>
        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">{FEE_CHECK_COPY.couldNotConfirm}</p>
        {renderButton(FEE_CHECK_COPY.buttonAgain)}
      </>
    );
  } else {
    const feeCheck = data.feeCheck;
    // Explicit handling of all three EbayFeeCheckResult variants -- no silent fallthrough.
    if (feeCheck.status === 'free') {
      body = (
        <p className="text-[11px] text-green-700 dark:text-green-400 font-medium mt-1">
          Free eBay listing
        </p>
      );
    } else if (feeCheck.status === 'fee') {
      body = (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium mt-1">
          ${feeCheck.amount.toFixed(2)} eBay insertion fee
        </p>
      );
    } else {
      // feeCheck.status === 'unknown'
      body = (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1" title={feeCheck.reason}>
          {FEE_CHECK_COPY.couldNotConfirm}
        </p>
      );
    }
  }

  return <div aria-live="polite">{body}</div>;
};
