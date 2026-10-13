import React from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

// ADR-139 §6: static landing page after a recruit-email unsubscribe. The backend has already
// applied the opt-out before redirecting here; this page runs no logic of its own.
// (The existing /unsubscribe page and routes/unsubscribe.ts are separate and untouched.)

export default function RecruitUnsubscribedPage() {
  const router = useRouter();
  const preview = router.query.preview === '1';

  return (
    <>
      <Head>
        <title>Unsubscribed - FindA.Sale</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-warm-50 to-warm-100 dark:from-gray-900 dark:to-gray-800 flex items-start sm:items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8 text-center">
          {preview ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">Preview link</h1>
              <p className="text-gray-600 dark:text-gray-400">This is the unsubscribe link from an email preview. Nothing was changed.</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">You have been unsubscribed</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-4">You won&apos;t hear from us again.</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Questions? Email{' '}
                <a href="mailto:support@finda.sale" className="text-amber-600 dark:text-amber-400 underline">
                  support@finda.sale
                </a>
                . The FindA.Sale Team.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
