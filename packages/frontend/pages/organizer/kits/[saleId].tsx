/**
 * Old kits page: /organizer/kits/[saleId]. Kits now live inside the item edit page (the "Quantity & setup" section), and a kit is made with
 * "Add a kit" on the Add Items screen. This stays only so old links and bookmarks keep working: it sends the organizer to that sale's
 * Add Items screen (or the dashboard when there is no sale in the link). Everything the old page did moved to the item edit page.
 */
import React, { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

const KitsRedirectPage = () => {
  const router = useRouter();
  const raw = router.query.saleId;
  const saleId = typeof raw === 'string' && raw !== '' ? raw : null;
  const target = saleId ? `/organizer/add-items/${encodeURIComponent(saleId)}` : '/organizer/dashboard';

  useEffect(() => {
    if (!router.isReady) return;
    router.replace(target);
  }, [router, target]);

  return (
    <>
      <Head>
        <title>Kits - FindA.Sale</title>
      </Head>
      <main className="min-h-screen bg-warm-50 py-6 dark:bg-gray-900">
        <div className="mx-auto w-full max-w-3xl min-w-0 px-4">
          <p role="status" className="text-sm text-warm-700 dark:text-warm-300">
            Kits are now part of each item. Taking you to your items...
          </p>
          <Link href={target} className="mt-2 inline-flex min-h-[44px] items-center text-sm font-medium text-amber-700 underline dark:text-amber-400">
            Go there now
          </Link>
        </div>
      </main>
    </>
  );
};

export default KitsRedirectPage;
