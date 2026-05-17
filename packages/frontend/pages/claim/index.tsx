import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function ClaimLandingPage() {
  return (
    <>
      <Head>
        <title>Claim Your Listing - FindA.Sale</title>
        <meta name="description" content="Claim your business listing on FindA.Sale to manage photos, respond to reviews, and connect with shoppers." />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-warm-50 to-warm-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
            <div className="text-5xl mb-4">🏷️</div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              Claim Your Listing
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Own or manage a sale listed on FindA.Sale? Claiming your listing lets you manage photos, reply to reviews, and connect with shoppers.
            </p>

            <div className="text-left space-y-4 mb-8">
              <div className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center justify-center text-sm font-bold">1</span>
                <p className="text-gray-700 dark:text-gray-300 text-sm">Find your sale using the <Link href="/map" className="text-amber-600 hover:underline">Map</Link> or <Link href="/" className="text-amber-600 hover:underline">Search</Link>.</p>
              </div>
              <div className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center justify-center text-sm font-bold">2</span>
                <p className="text-gray-700 dark:text-gray-300 text-sm">Look for the "Is this your sale?" section on the sale page and click <strong>Claim</strong>.</p>
              </div>
              <div className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center justify-center text-sm font-bold">3</span>
                <p className="text-gray-700 dark:text-gray-300 text-sm">Submit your name and email. We'll send a verification link, then review your claim within 2–3 business days.</p>
              </div>
            </div>

            <Link
              href="/"
              className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Find Your Sale
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
