/**
 * RepriceUnpricedLink (ADR-140 section 12.4, batch B8): one line under the "cards have no price yet" note of a card import
 * or scan save: "Price the 12 cards without a price from my price book". It links to the Changes tab already set to
 * "Only cards without a price" for that save. Nothing is written by the link; the preview and Apply steps are the same as
 * any run. Renders nothing unless some cards have no price, the save has a batch, and the price book and the shop's own
 * book are both on.
 */
import React from 'react';
import Link from 'next/link';
import { PRICE_BOOK_COPY } from '../../lib/priceBookCopy';
import { offerRepriceUnpriced, repriceUnpricedHref } from '../../lib/priceBookWiring';
import { linkBtn } from './ui';
import { usePriceBookStatus } from './usePriceBookData';

export interface RepriceUnpricedLinkProps {
  /** How many cards in the save have no price (the summary's needsPrice). */
  needsPrice: number;
  saleId: string | null | undefined;
  /** The save's batch id. Without one the line is not offered. */
  batchId: string | null | undefined;
  className?: string;
}

const RepriceUnpricedLink: React.FC<RepriceUnpricedLinkProps> = ({ needsPrice, saleId, batchId, className }) => {
  const status = usePriceBookStatus(needsPrice > 0 && !!batchId);
  if (!offerRepriceUnpriced({ needsPrice, batchId, status: status.data })) return null;
  return (
    <p className={className || 'mt-2'}>
      <Link href={repriceUnpricedHref(saleId, batchId)} className={linkBtn}>
        {PRICE_BOOK_COPY.repriceUnpricedLine(needsPrice)}
      </Link>
    </p>
  );
};

export default RepriceUnpricedLink;
