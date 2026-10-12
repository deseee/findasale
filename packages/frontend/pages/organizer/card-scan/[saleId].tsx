/**
 * Scan cards page (ADR-138 batch B7): /organizer/card-scan/[saleId]
 * Take a picture of each card (or upload pictures, or search), check what was read, and save the ready cards to the sale's stock.
 * The screens live in components/cardScan/; this page only handles sign-in, the sale id and the page frame.
 */
import React, { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../../components/AuthContext';
import ScanFlow from '../../../components/cardScan/ScanFlow';
import { SCAN_COPY } from '../../../lib/cardScanCopy';

const CardScanPage = () => {
  const router = useRouter();
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

  return (
    <>
      <Head>
        <title>{`${SCAN_COPY.pageTitle} - FindA.Sale`}</title>
      </Head>
      <main className="min-h-screen bg-warm-50 py-6 dark:bg-gray-900">
        <div className="mx-auto w-full max-w-3xl min-w-0 px-4">
          {saleId ? (
            <Link
              href={`/organizer/add-items/${encodeURIComponent(saleId)}`}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-amber-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400"
            >
              {SCAN_COPY.backToItems}
            </Link>
          ) : null}
          <h1 className="mt-2 break-words text-2xl font-bold text-warm-900 dark:text-warm-100 sm:text-3xl">{SCAN_COPY.pageTitle}</h1>
          <p className="mt-2 text-sm text-warm-700 dark:text-warm-300">{SCAN_COPY.pageIntro}</p>
          <div className="mt-6">
            {ready && saleId ? (
              <ScanFlow key={saleId} saleId={saleId} />
            ) : (
              <p role="status" className="text-sm text-warm-600 dark:text-warm-300">
                {SCAN_COPY.pageLoading}
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
};

export default CardScanPage;
