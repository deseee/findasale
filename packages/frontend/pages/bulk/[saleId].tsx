/**
 * Public bulk price list (ADR-136, roadmap #659): /bulk/[saleId]
 * Every bulk lot in a sale with its price per 1,000 cards and a price list. Read only. Shoppers pay at the register.
 *
 * The page asks GET /api/bulk-lots/sale/:saleId/public. While CARD_BULK_LOTS_ENABLED is off the server answers 404
 * BULK_DISABLED and this page says there are no bulk lots, so nothing is exposed before the feature is switched on.
 */
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import BulkLotCard from '../../components/BulkLotCard';
import { BULK_COPY, BulkLot, describeBulkError } from '../../lib/bulkLot';

interface PublicLotsResponse {
  saleId: string;
  saleTitle: string | null;
  lots: BulkLot[];
}

const BulkPriceListPage = () => {
  const router = useRouter();
  const raw = router.query.saleId;
  const saleId = typeof raw === 'string' && raw !== '' ? raw : null;

  const query = useQuery<PublicLotsResponse | null>({
    queryKey: ['bulk-lots-public', saleId],
    queryFn: async () => {
      try {
        const res = await api.get(`/bulk-lots/sale/${encodeURIComponent(saleId as string)}/public`);
        return res.data?.data as PublicLotsResponse;
      } catch (err) {
        // Off, or not a public sale: the same quiet "nothing here" answer, never an error screen.
        const info = describeBulkError(err);
        if (info.code === 'BULK_DISABLED' || info.code === 'SALE_NOT_FOUND') return null;
        throw err;
      }
    },
    enabled: router.isReady && !!saleId,
    staleTime: 30 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const data = query.data ?? null;
  const lots = data?.lots ?? [];

  return (
    <>
      <Head>
        <title>{`${BULK_COPY.publicHeading} - FindA.Sale`}</title>
      </Head>
      <main className="min-h-screen bg-warm-50 py-6 dark:bg-gray-900">
        <div className="mx-auto w-full max-w-3xl min-w-0 px-4">
          {saleId && (
            <Link
              href={`/sales/${encodeURIComponent(saleId)}`}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-amber-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400"
            >
              {BULK_COPY.publicBackToSale}
            </Link>
          )}
          <h1 className="mt-2 break-words text-2xl font-bold text-warm-900 dark:text-warm-100 sm:text-3xl">{BULK_COPY.publicHeading}</h1>
          {data?.saleTitle && <p className="mt-1 break-words text-sm text-warm-600 dark:text-warm-400">{data.saleTitle}</p>}
          <p className="mt-2 text-sm text-warm-700 dark:text-warm-300">{BULK_COPY.publicIntro}</p>

          <div className="mt-6 space-y-4">
            {(!router.isReady || query.isLoading) && (
              <p role="status" className="text-sm text-warm-600 dark:text-warm-300">
                {BULK_COPY.manageLoading}
              </p>
            )}
            {query.isError && (
              <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
                <p>{BULK_COPY.publicLoadError}</p>
                <button type="button" onClick={() => query.refetch()} className="mt-2 min-h-[44px] rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">
                  {BULK_COPY.retry}
                </button>
              </div>
            )}
            {query.isSuccess && lots.length === 0 && <p className="text-sm text-warm-700 dark:text-warm-300">{BULK_COPY.publicEmpty}</p>}
            {lots.map((lot) => (
              <BulkLotCard key={lot.itemId} lot={lot} />
            ))}
          </div>
        </div>
      </main>
    </>
  );
};

export default BulkPriceListPage;
