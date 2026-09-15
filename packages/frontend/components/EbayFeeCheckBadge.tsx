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

// Mirrors EbayFeeCheckResult in packages/backend/src/lib/ebayListingFeeCheck.ts.
export type EbayFeeCheckResult =
  | { status: 'free' }
  | { status: 'fee'; amount: number; currency: string }
  | { status: 'unknown'; reason: string };

// Pre-flight eBay insertion-fee visibility (2026-09-15): shows whether pushing
// THIS item live would incur a real eBay fee, before the organizer clicks the
// bulk "Push N to eBay" button below. Trigger timing: fires once per item the
// moment it's checked (`enabled` follows selection state), not for every item
// on page load -- selecting an item is already a deliberate "I might push
// this" signal, so this is the cheapest point to spend the eBay API call
// without checking items the organizer never intends to push.
// staleTime: Infinity + retry: false -- one check per item per page visit is
// enough (the underlying eBay offer this reuses doesn't need re-querying if
// the organizer checks/unchecks the same item), and a fee-check failure isn't
// worth silently retrying against eBay's live API.
export const EbayFeeCheckBadge: React.FC<{ itemId: string; enabled: boolean }> = ({ itemId, enabled }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ebay-fee-check', itemId],
    queryFn: async () => {
      const response = await api.post(`/ebay/organizer/items/${itemId}/ebay-fee-check`);
      return response.data as { itemId: string; feeCheck: EbayFeeCheckResult };
    },
    enabled,
    staleTime: Infinity,
    retry: false,
  });

  if (!enabled) return null;

  if (isLoading) {
    return (
      <p className="text-[11px] text-warm-500 dark:text-warm-400 italic mt-1">
        Checking eBay listing fee…
      </p>
    );
  }

  const feeCheck = data?.feeCheck;

  if (isError || !feeCheck) {
    return (
      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
        Couldn't confirm eBay listing fee — proceed with caution
      </p>
    );
  }

  // Explicit handling of all three EbayFeeCheckResult variants -- no silent fallthrough.
  if (feeCheck.status === 'free') {
    return (
      <p className="text-[11px] text-green-700 dark:text-green-400 font-medium mt-1">
        Free eBay listing
      </p>
    );
  }
  if (feeCheck.status === 'fee') {
    return (
      <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium mt-1">
        ${feeCheck.amount.toFixed(2)} eBay insertion fee
      </p>
    );
  }
  // feeCheck.status === 'unknown'
  return (
    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1" title={feeCheck.reason}>
      Couldn't confirm eBay listing fee — proceed with caution
    </p>
  );
};
