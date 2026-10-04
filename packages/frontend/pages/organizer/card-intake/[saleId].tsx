/**
 * Card intake page (ADR-134 #642, batch B8): /organizer/card-intake/[saleId]
 * Spreadsheet-first import of a seller's cards into one sale: Upload, Condition mapping, Ambiguous rows, Confirm.
 * The screens live in components/cardIntake/; this page only handles sign-in, the sale id and the page frame.
 */
import React, { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../../components/AuthContext';
import CardIntakeFlow from '../../../components/cardIntake/CardIntakeFlow';
import { INTAKE_COPY } from '../../../lib/cardIntakeCopy';

const CardIntakePage = () => {
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
        <title>{`${INTAKE_COPY.pageTitle} - FindA.Sale`}</title>
      </Head>
      <main className="min-h-screen bg-warm-50 py-6 dark:bg-gray-900">
        <div className="mx-auto w-full max-w-3xl min-w-0 px-4">
          {saleId ? (
            <Link
              href={`/organizer/add-items/${encodeURIComponent(saleId)}`}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-amber-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400"
            >
              {INTAKE_COPY.backToItems}
            </Link>
          ) : null}
          <h1 className="mt-2 break-words text-2xl font-bold text-warm-900 dark:text-warm-100 sm:text-3xl">{INTAKE_COPY.pageTitle}</h1>
          <p className="mt-2 text-sm text-warm-700 dark:text-warm-300">{INTAKE_COPY.pageIntro}</p>
          <div className="mt-6">
            {ready && saleId ? (
              <CardIntakeFlow key={saleId} saleId={saleId} />
            ) : (
              <p role="status" className="text-sm text-warm-600 dark:text-warm-300">
                {INTAKE_COPY.loading}
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
};

export default CardIntakePage;
