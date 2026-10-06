/**
 * Bulk lot holds at the register (ADR-136 Addendum D, roadmap #659): /organizer/bulk-lots/[saleId]/holds
 *
 * The page a team member opens to work with holds on the lots of the shop's sale: set cards aside for a customer (with an optional email
 * for the confirmation and the reminder), turn a hold into a sale (cash now, or a Square link), or release it. It is the hold half of
 * BulkLotFollowupPanel (holdsOnly): no recount and no refunds, which stay with the shop owner.
 *
 * Any signed-in account may open the page. The server decides: it resolves the account the same way the register does (the shop owner,
 * or a team member with register access) and answers 403 for anyone else, which this page shows as one plain line. The shop owner can
 * open it too. While CARD_BULK_LOTS_ENABLED is off the status route says so and the page shows a "not turned on" line.
 */
import React, { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../../lib/api';
import { useAuth } from '../../../../components/AuthContext';
import BulkLotFollowupPanel from '../../../../components/BulkLotFollowupPanel';
import { BulkLot, BulkStatus, formatCardCount, readBulkStatus } from '../../../../lib/bulkLot';
import { FOLLOWUP_COPY as C, isNoRegisterAccess } from '../../../../lib/bulkLotFollowup';

const BulkLotHoldsPage = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const raw = router.query.saleId;
  const saleId = typeof raw === 'string' && raw !== '' ? raw : null;

  useEffect(() => {
    if (!router.isReady || authLoading) return;
    if (!user) router.push('/login');
  }, [router, authLoading, user]);

  const ready = router.isReady && !authLoading && !!user && !!saleId;

  const statusQuery = useQuery({
    queryKey: ['bulk-lots-status'],
    queryFn: async (): Promise<BulkStatus> => readBulkStatus((await api.get('/bulk-lots/status')).data),
    enabled: ready,
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const enabled = statusQuery.data?.enabled === true;

  const listKey = ['bulk-lots-holds-page', saleId];
  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: async (): Promise<BulkLot[]> => {
      const res = await api.get(`/bulk-lots/sale/${encodeURIComponent(saleId as string)}`);
      return (res.data?.data?.lots ?? []) as BulkLot[];
    },
    enabled: ready && enabled,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const lots = listQuery.data ?? [];
  const noAccess = listQuery.isError && isNoRegisterAccess(listQuery.error);

  return (
    <>
      <Head>
        <title>Holds at the register - FindA.Sale</title>
      </Head>
      <main className="min-h-screen bg-warm-50 py-6 dark:bg-gray-900">
        <div className="mx-auto w-full max-w-3xl min-w-0 px-4">
          <h1 className="break-words text-2xl font-bold text-warm-900 dark:text-warm-100 sm:text-3xl">{C.staffHoldsTitle}</h1>
          <p className="mt-2 text-sm text-warm-700 dark:text-warm-300">{C.staffHoldsIntro}</p>

          <div className="mt-6 space-y-6">
            {!ready && (
              <p role="status" className="text-sm text-warm-600 dark:text-warm-300">
                {authLoading || !router.isReady ? C.staffLoading : C.staffSignIn}
              </p>
            )}

            {ready && statusQuery.isSuccess && !enabled && (
              <p role="status" className="text-sm text-warm-700 dark:text-warm-300">
                {C.staffNotOn}
              </p>
            )}

            {ready && enabled && listQuery.isLoading && (
              <p role="status" className="text-sm text-warm-600 dark:text-warm-300">
                {C.staffLoading}
              </p>
            )}

            {ready && enabled && noAccess && (
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
                {C.staffNoAccess}
              </p>
            )}

            {ready && enabled && listQuery.isSuccess && lots.length === 0 && (
              <p role="status" className="text-sm text-warm-700 dark:text-warm-300">
                {C.staffNoLots}
              </p>
            )}

            {ready && enabled && lots.map((lot) => (
              <section key={lot.itemId} aria-label={lot.title} className="space-y-2 rounded-lg border border-warm-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="break-words text-lg font-semibold text-warm-900 dark:text-warm-100">{lot.title}</h2>
                <p className="text-sm text-warm-700 dark:text-warm-300">
                  {C.staffCardsLeft}: {formatCardCount(lot.remainingCards)}
                  {lot.pricePerThousandLabel ? `. ${lot.pricePerThousandLabel}` : ''}
                </p>
                <BulkLotFollowupPanel
                  itemId={lot.itemId}
                  lot={lot}
                  holdsOnly
                  onLotChange={() => {
                    queryClient.invalidateQueries({ queryKey: listKey });
                  }}
                />
              </section>
            ))}

            <Link
              href="/organizer/pos"
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-amber-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400"
            >
              Back to the register
            </Link>
          </div>
        </div>
      </main>
    </>
  );
};

export default BulkLotHoldsPage;
