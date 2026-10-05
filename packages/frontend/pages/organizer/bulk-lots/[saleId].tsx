/**
 * Bulk lots management page (ADR-136, roadmap #659): /organizer/bulk-lots/[saleId]
 * Add bulk commons, uncommons and other bulk by the thousand to one sale, and restock or reprice them. Shoppers see the
 * price per 1,000 and a price list; the register asks how many cards to sell.
 *
 * The page only handles sign-in, the sale id and the frame. It reads GET /api/bulk-lots/status first and shows a plain
 * "not turned on" line while CARD_BULK_LOTS_ENABLED is off.
 */
import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import { useAuth } from '../../../components/AuthContext';
import { useToast } from '../../../components/ToastContext';
import BulkLotSection from '../../../components/BulkLotSection';
import {
  BULK_COPY,
  BulkLot,
  BulkStatus,
  describeBulkError,
  formatCardCount,
  parseLotTotal,
  parsePricePerThousand,
  readBulkStatus,
} from '../../../lib/bulkLot';

const inputCls =
  'w-full min-h-[44px] px-4 py-2 text-base sm:text-sm border border-warm-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-60';
const labelCls = 'block text-sm font-medium text-warm-700 dark:text-warm-300 mb-1';

const BulkLotsPage = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const raw = router.query.saleId;
  const saleId = typeof raw === 'string' && raw !== '' ? raw : null;
  const isOrganizer = !!user && !!user.roles && user.roles.includes('ORGANIZER');

  useEffect(() => {
    if (!router.isReady || authLoading) return;
    if (!isOrganizer) {
      router.push('/login');
    } else if (!saleId) {
      router.replace('/organizer/dashboard');
    }
  }, [router, authLoading, isOrganizer, saleId]);

  const ready = router.isReady && !authLoading && isOrganizer && !!saleId;

  const statusQuery = useQuery({
    queryKey: ['bulk-lots-status'],
    queryFn: async (): Promise<BulkStatus> => readBulkStatus((await api.get('/bulk-lots/status')).data),
    enabled: ready,
    staleTime: 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const status = statusQuery.data;
  const enabled = status?.enabled === true;

  const listKey = ['bulk-lots-manage', saleId];
  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: async (): Promise<BulkLot[]> => {
      const res = await api.get(`/bulk-lots/sale/${encodeURIComponent(saleId as string)}`);
      return (res.data?.data?.lots ?? []) as BulkLot[];
    },
    enabled: ready && enabled,
    staleTime: 0,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const lots = listQuery.data ?? [];

  const [name, setName] = useState('');
  const [totalText, setTotalText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [kind, setKind] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const kindValue = kind || status?.vocabulary?.defaultKind || '';

  const create = async () => {
    const title = name.trim();
    const total = parseLotTotal(totalText);
    const price = parsePricePerThousand(priceText);
    if (!title) return setError(BULK_COPY.errorName);
    if (total === null) return setError(BULK_COPY.errorTotal);
    if (price === null) return setError(BULK_COPY.errorPrice);
    setCreating(true);
    setError('');
    try {
      await api.post(`/bulk-lots/sale/${encodeURIComponent(saleId as string)}/items`, {
        title,
        totalCards: total,
        pricePerThousand: price,
        ...(kindValue ? { lotKind: kindValue } : {}),
      });
      setName('');
      setTotalText('');
      setPriceText('');
      showToast(BULK_COPY.manageCreated, 'success');
      await queryClient.invalidateQueries({ queryKey: listKey });
    } catch (err) {
      setError(describeBulkError(err).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Head>
        <title>{`${BULK_COPY.managePageTitle} - FindA.Sale`}</title>
      </Head>
      <main className="min-h-screen bg-warm-50 py-6 dark:bg-gray-900">
        <div className="mx-auto w-full max-w-3xl min-w-0 px-4">
          {saleId ? (
            <Link
              href={`/organizer/add-items/${encodeURIComponent(saleId)}`}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-amber-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400"
            >
              {BULK_COPY.manageBackToItems}
            </Link>
          ) : null}
          <h1 className="mt-2 break-words text-2xl font-bold text-warm-900 dark:text-warm-100 sm:text-3xl">{BULK_COPY.managePageTitle}</h1>
          <p className="mt-2 text-sm text-warm-700 dark:text-warm-300">{BULK_COPY.managePageIntro}</p>

          <div className="mt-6 space-y-6">
            {!ready && (
              <p role="status" className="text-sm text-warm-600 dark:text-warm-300">
                {BULK_COPY.manageLoading}
              </p>
            )}

            {ready && statusQuery.isSuccess && !enabled && (
              <p role="status" className="text-sm text-warm-700 dark:text-warm-300">
                {BULK_COPY.manageDisabled}
              </p>
            )}

            {ready && enabled && (
              <>
                <section aria-labelledby="bulk-new-heading" className="space-y-3 rounded-lg border border-warm-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <h2 id="bulk-new-heading" className="text-lg font-semibold text-warm-900 dark:text-warm-100">
                    {BULK_COPY.manageNewHeading}
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor="bulk-new-name" className={labelCls}>
                        {BULK_COPY.manageNameLabel}
                      </label>
                      <input id="bulk-new-name" type="text" maxLength={80} value={name} disabled={creating} placeholder={BULK_COPY.manageNamePlaceholder} onChange={(e) => setName(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="bulk-new-total" className={labelCls}>
                        {BULK_COPY.totalCardsLabel}
                      </label>
                      <input id="bulk-new-total" type="text" inputMode="numeric" value={totalText} disabled={creating} onChange={(e) => setTotalText(e.target.value)} className={inputCls} />
                      <p className="mt-1 text-xs text-warm-500 dark:text-warm-400">{BULK_COPY.totalCardsHelp}</p>
                    </div>
                    <div>
                      <label htmlFor="bulk-new-price" className={labelCls}>
                        {BULK_COPY.priceLabel}
                      </label>
                      <input id="bulk-new-price" type="text" inputMode="decimal" value={priceText} disabled={creating} onChange={(e) => setPriceText(e.target.value)} className={inputCls} />
                      <p className="mt-1 text-xs text-warm-500 dark:text-warm-400">{BULK_COPY.priceHelp}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="bulk-new-kind" className={labelCls}>
                        {BULK_COPY.kindLabel}
                      </label>
                      <select id="bulk-new-kind" value={kindValue} disabled={creating} onChange={(e) => setKind(e.target.value)} className={inputCls}>
                        {(status?.vocabulary?.kinds ?? []).map((k) => (
                          <option key={k} value={k}>
                            {status?.vocabulary?.labels[k] ?? k}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-warm-500 dark:text-warm-400">{BULK_COPY.ebayNote}</p>
                  {error && (
                    <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={create}
                    disabled={creating}
                    className="min-h-[44px] w-full rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50 sm:w-auto"
                  >
                    {creating ? `${BULK_COPY.manageCreating}...` : BULK_COPY.manageCreate}
                  </button>
                </section>

                <section aria-labelledby="bulk-list-heading" className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="bulk-list-heading" className="text-lg font-semibold text-warm-900 dark:text-warm-100">
                      {BULK_COPY.manageListHeading}
                    </h2>
                    {saleId && (
                      <Link
                        href={`/bulk/${encodeURIComponent(saleId)}`}
                        className="inline-flex min-h-[44px] items-center text-sm font-medium text-amber-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400"
                      >
                        {BULK_COPY.manageViewPublic}
                      </Link>
                    )}
                  </div>

                  {listQuery.isLoading && (
                    <p role="status" className="text-sm text-warm-600 dark:text-warm-300">
                      {BULK_COPY.manageLoading}
                    </p>
                  )}
                  {listQuery.isError && (
                    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
                      <p>{BULK_COPY.panelLoadError}</p>
                      <button type="button" onClick={() => listQuery.refetch()} className="mt-2 min-h-[44px] rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">
                        {BULK_COPY.retry}
                      </button>
                    </div>
                  )}
                  {listQuery.isSuccess && lots.length === 0 && <p className="text-sm text-warm-700 dark:text-warm-300">{BULK_COPY.manageEmpty}</p>}

                  {lots.map((lot) => (
                    <div key={lot.itemId} className="rounded-lg border border-warm-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="break-words text-base font-semibold text-warm-900 dark:text-warm-100">{lot.title}</h3>
                          <p className="text-xs text-warm-600 dark:text-warm-400">{lot.lotKindLabel}</p>
                          <p className="mt-1 text-sm text-warm-800 dark:text-warm-200">
                            {lot.pricePerThousandLabel ?? ''}
                            {lot.pricePerThousandLabel ? '. ' : ''}
                            {lot.soldOut ? BULK_COPY.publicSoldOut : `${formatCardCount(lot.remainingCards)} of ${formatCardCount(lot.totalCards)} cards left`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingId(editingId === lot.itemId ? null : lot.itemId)}
                          aria-expanded={editingId === lot.itemId}
                          className="min-h-[44px] rounded-lg bg-warm-100 px-4 text-sm font-semibold text-warm-900 transition-colors hover:bg-warm-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                        >
                          {editingId === lot.itemId ? BULK_COPY.manageClose : BULK_COPY.manageEdit}
                        </button>
                      </div>
                      {editingId === lot.itemId && (
                        <div className="mt-3">
                          <BulkLotSection
                            itemId={lot.itemId}
                            hasCardRecord
                            onLotChange={() => {
                              queryClient.invalidateQueries({ queryKey: listKey });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
};

export default BulkLotsPage;
