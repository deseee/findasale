/**
 * Price Book page (ADR-140 section 11): /organizer/price-book
 * The shop's own pricing rules, bulk rate card, typed card prices and the "Reprice my cards" flow with preview and undo.
 *
 * The page handles sign-in, the tab (URL ?tab=prices|bulk|cards|changes) and the frame, and hands the rest to
 * components/priceBook/PriceBookScreen. It reads GET /api/price-book/status first and shows a plain "not turned on" line
 * while the feature is off. Every string comes from lib/priceBookCopy.ts. Nothing on this page changes an item price by itself.
 */
import React, { useCallback, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../../components/AuthContext';
import PriceBookScreen from '../../../components/priceBook/PriceBookScreen';
import { linkBtn, readTab } from '../../../components/priceBook/ui';
import type { TabKey } from '../../../components/priceBook/ui';
import { PRICE_BOOK_COPY, PRICE_BOOK_UI } from '../../../lib/priceBookCopy';
import { readUnpricedPreset } from '../../../lib/priceBookWiring';

const PriceBookPage: React.FC = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const isOrganizer = !!user && !!user.roles && user.roles.includes('ORGANIZER');
  const ready = router.isReady && !authLoading && isOrganizer;

  useEffect(() => {
    if (!router.isReady || authLoading) return;
    if (!isOrganizer) router.push('/login');
  }, [router, authLoading, isOrganizer]);

  const selectTab = useCallback(
    (next: TabKey): void => {
      void router.replace({ pathname: router.pathname, query: { tab: next } }, undefined, { shallow: true });
    },
    [router]
  );

  return (
    <>
      <Head>
        <title>{`${PRICE_BOOK_COPY.title} - FindA.Sale`}</title>
      </Head>
      <main className="min-h-screen bg-warm-50 py-6 dark:bg-gray-900">
        <div className="mx-auto w-full min-w-0 max-w-3xl px-4">
          <Link href="/organizer/dashboard" className={linkBtn}>
            {PRICE_BOOK_UI.backToDashboard}
          </Link>
          <PriceBookScreen ready={ready} tab={readTab(router.query.tab)} onSelectTab={selectTab} preset={readUnpricedPreset(router.query)} />
        </div>
      </main>
    </>
  );
};

export default PriceBookPage;
