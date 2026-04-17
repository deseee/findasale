/**
 * /shopper/crews - Coming Soon
 * Deferred feature placeholder
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

const CrewsPage = () => {
  return (
    <>
      <Head>
        <title>Explorer's Crews - Coming Soon | FindA.Sale</title>
        <meta
          name="description"
          content="Explorer's Crews are coming soon! Join collectors and coordinate your treasure hunts together."
        />
      </Head>

      <main className="bg-warm-50 dark:bg-gray-900 py-12 md:py-16 min-h-screen">
        <div className="container mx-auto px-4 max-w-2xl">
          {/* Coming Soon Card */}
          <div className="text-center">
            <div className="mb-8">
              <div className="text-6xl md:text-7xl mb-6">👥</div>
              <h1 className="text-4xl md:text-5xl font-bold text-warm-900 dark:text-warm-100 mb-3 font-fraunces">
                Explorer's Crews
              </h1>
              <p className="text-xl text-warm-600 dark:text-warm-400 mb-6 max-w-lg mx-auto">
                Coordinate with fellow collectors, share finds, and explore together. Coming soon.
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-8">
              <h2 className="text-2xl font-semibold text-warm-900 dark:text-warm-100 mb-4">
                What are Crews?
              </h2>
              <p className="text-warm-700 dark:text-warm-300 text-lg leading-relaxed mb-6">
                Crews are social groups for shoppers to coordinate hunts, share finds, and build collections together. Create or join a crew to connect with collectors who share your interests—whether you're hunting vintage furniture, collectibles, or hidden gems at estate sales.
              </p>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="text-warm-700 dark:text-warm-300">
                  We're building the Crews experience now and will have it ready soon. We'll let you know when it launches.
                </p>
              </div>
            </div>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/items"
                className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Browse Items Now
              </Link>
              <Link
                href="/"
                className="inline-block bg-white dark:bg-gray-800 hover:bg-warm-50 dark:hover:bg-gray-700 text-warm-900 dark:text-warm-100 border border-warm-300 dark:border-gray-600 font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

export default CrewsPage;
