/**
 * Feature #49: City Heat Index
 *
 * Page: /city-heat-index
 * - Coming soon page showing which cities have the most active sales
 * - Links to city browser
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const CityHeatIndexPage = () => {
  return (
    <>
      <Head>
        <title>City Heat Index - FindA.Sale</title>
        <meta name="description" content="See which cities have the most active sales this week" />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <main className="container mx-auto px-4 py-12">
          <Link href="/" className="text-amber-600 hover:text-amber-700 font-medium mb-8 inline-block">
            ← Back to home
          </Link>

          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
              <div className="mb-6 text-5xl">🔥</div>
              <h1 className="text-4xl font-bold text-warm-900 dark:text-gray-50 mb-3">
                City Heat Index
              </h1>
              <p className="text-xl text-warm-700 dark:text-gray-300 mb-8">
                Discover which cities have the most active sales this week. Coming soon!
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/cities"
                  className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
                >
                  Browse All Cities
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default CityHeatIndexPage;
