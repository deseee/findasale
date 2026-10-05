/**
 * BulkLotCard (ADR-136, roadmap #659): one bulk lot for shoppers, with its price per 1,000 and a price list.
 *
 * Every figure comes from the server (GET /api/bulk-lots/.../public), already formatted. The browser does no pricing
 * arithmetic. Used on the public price list page and, in place of the buy buttons, on a bulk lot's item page.
 */
import React from 'react';
import Link from 'next/link';
import { BULK_COPY, BulkLot } from '../lib/bulkLot';

export interface BulkLotCardProps {
  lot: BulkLot;
  /** When set, shows a link to that sale's full price list. */
  priceListSaleId?: string | null;
  /** Use a heading level that fits the page (the list page uses h2, an item page uses h3). */
  headingLevel?: 'h2' | 'h3';
}

const BulkLotCard: React.FC<BulkLotCardProps> = ({ lot, priceListSaleId, headingLevel = 'h2' }) => {
  const Heading = headingLevel;
  return (
    <section className="rounded-lg border border-warm-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <Heading className="break-words text-lg font-semibold text-warm-900 dark:text-warm-100">{lot.title}</Heading>
      <p className="mt-1 text-xs text-warm-600 dark:text-warm-400">{lot.lotKindLabel}</p>

      {lot.soldOut ? (
        <p className="mt-3 text-base font-semibold text-warm-700 dark:text-warm-300">{BULK_COPY.publicSoldOut}</p>
      ) : (
        <>
          {lot.pricePerThousandLabel && (
            <p className="mt-3 text-2xl font-bold text-warm-900 dark:text-warm-100">{lot.pricePerThousandLabel}</p>
          )}
          {lot.perCardLabel && <p className="text-xs text-warm-500 dark:text-warm-400">About {lot.perCardLabel}</p>}
          <p className="mt-1 text-sm text-warm-700 dark:text-warm-300">{lot.remainingLabel}</p>

          {lot.ladder.length > 0 && (
            <table className="mt-3 w-full text-sm">
              <caption className="sr-only">{BULK_COPY.publicPriceListHeading}</caption>
              <thead>
                <tr className="border-b border-warm-200 text-left text-xs text-warm-600 dark:border-gray-700 dark:text-warm-400">
                  <th scope="col" className="py-1 pr-2 font-medium">
                    {BULK_COPY.publicCardsColumn}
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    {BULK_COPY.publicPriceColumn}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lot.ladder.map((row) => (
                  <tr key={row.cards} className="border-b border-warm-100 last:border-0 dark:border-gray-700">
                    <td className="py-1 pr-2 text-warm-900 dark:text-warm-100">{row.isAll ? `${BULK_COPY.regAllLabel} ${row.cardsLabel}` : row.cardsLabel}</td>
                    <td className="py-1 text-right font-semibold text-warm-900 dark:text-warm-100">{row.priceLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <p className="mt-3 text-xs text-warm-600 dark:text-warm-400">{BULK_COPY.publicInStoreNote}</p>

      {priceListSaleId && (
        <Link
          href={`/bulk/${encodeURIComponent(priceListSaleId)}`}
          className="mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-amber-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400"
        >
          {BULK_COPY.publicPriceListHeading}
        </Link>
      )}
    </section>
  );
};

export default BulkLotCard;
