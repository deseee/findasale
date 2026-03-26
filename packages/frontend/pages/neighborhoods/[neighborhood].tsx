/**
 * Feature #188: Neighborhood Pages
 *
 * Page: /neighborhoods/[neighborhood]
 * - Coming soon page for browsing sales by neighborhood
 * - Links to city and map views
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

const NeighborhoodPage = () => {
  const router = useRouter();
  const { neighborhood } = router.query;
  const neighborhoodName = typeof neighborhood === 'string'
    ? neighborhood.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Neighborhood';

  return (
    <>
      <Head>
        <title>{neighborhoodName} Sales - FindA.Sale</title>
        <meta name="description" content={`Browse sales in ${neighborhoodName} on FindA.Sale`} />
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
        <main className="container mx-auto px-4 py-12">
          <Link href="/" className="text-amber-600 hover:text-amber-700 font-medium mb-8 inline-block">
            ← Back to home
          </Link>

          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
              <div className="mb-6 text-5xl">🏘️</div>
              <h1 className="text-4xl font-bold text-warm-900 dark:text-gray-50 mb-3">
                {neighborhoodName}
              </h1>
              <p className="text-xl text-warm-700 dark:text-gray-300 mb-8">
                Neighborhood browsing coming soon! For now, explore sales by city or browse all sales on the map.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/cities"
                  className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
                >
                  Browse by City
                </Link>
                <Link
                  href="/map"
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                >
                  View on Map
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default NeighborhoodPage;
