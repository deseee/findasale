/**
 * TCGplayer sync page (ADR-137 #660): /organizer/card-tcgplayer/[saleId]
 * Download the update file for TCGplayer, and bring a TCGplayer inventory export back to reconcile quantities.
 * The screen lives in components/cardTcgplayer/SyncPanel.tsx; this page only handles sign-in, the sale id and the frame.
 */
import React, { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../../components/AuthContext';
import SyncPanel from '../../../components/cardTcgplayer/SyncPanel';
import { TCG_COPY } from '../../../lib/cardTcgplayer';

const CardTcgplayerPage = () => {
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
        <title>{`${TCG_COPY.pageTitle} - FindA.Sale`}</title>
      </Head>
      <main className="min-h-screen bg-warm-50 py-6 dark:bg-gray-900">
        <div className="mx-auto w-full max-w-3xl min-w-0 px-4">
          {saleId ? (
            <Link
              href={`/organizer/add-items/${encodeURIComponent(saleId)}`}
              className="inline-flex min-h-[44px] items-center text-sm font-medium text-amber-700 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-400"
            >
              {TCG_COPY.backToItems}
            </Link>
          ) : null}
          <h1 className="mt-2 break-words text-2xl font-bold text-warm-900 dark:text-warm-100 sm:text-3xl">{TCG_COPY.pageTitle}</h1>
          <p className="mt-2 text-sm text-warm-700 dark:text-warm-300">{TCG_COPY.pageIntro}</p>
          <div className="mt-6">
            {ready && saleId ? (
              <SyncPanel key={saleId} saleId={saleId} />
            ) : (
              <p role="status" className="text-sm text-warm-600 dark:text-warm-300">
                {TCG_COPY.loading}
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
};

export default CardTcgplayerPage;
