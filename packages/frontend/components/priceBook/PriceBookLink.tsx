/**
 * PriceBookLink (ADR-140 section 11, same pattern as BulkLotsLink): a link to the Price Book page.
 * Renders nothing unless GET /api/price-book/status says the price book is on, so a shop without it sees no change.
 * B8 mounts this next to the Bulk lots link; this batch only creates it.
 */
import React from 'react';
import Link from 'next/link';
import { PRICE_BOOK_COPY } from '../../lib/priceBookCopy';
import { usePriceBookStatus } from './usePriceBookData';

const PriceBookLink: React.FC<{ className?: string }> = ({ className }) => {
  const { data } = usePriceBookStatus();
  if (!data || !data.enabled) return null;
  return (
    <Link href="/organizer/price-book" className={className}>
      {PRICE_BOOK_COPY.linkLabel}
    </Link>
  );
};

export default PriceBookLink;
