/**
 * Persistent Inventory (Coming Soon)
 *
 * Future feature: Manage items across multiple sales. Perfect for flea market
 * vendors and recurring sale operators.
 * Route: /organizer/inventory
 */

import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../components/AuthContext';

const InventoryPage = () => {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  // Auth check
  if (!isLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4" />
          <p className="text-warm-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Inventory Library - FindA.Sale</title>
        <meta name="description" content="Persistent inventory for recurring sales" />
      </Head>
      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <Link
            href="/organizer/dashboard"
            className="text-amber-600 dark:text-amber-500 hover:underline text-sm font-medium mb-6 inline-block"
          >
            Back to dashboard
          </Link>

          {/* Heading */}
          <h1 className="text-4xl font-bold text-warm-900 dark:text-gray-100 mb-4">
            Persistent Inventory
          </h1>

          {/* Subheading */}
          <p className="text-lg text-warm-600 dark:text-gray-300 mb-12">
            Manage items across multiple sales. Perfect for flea market vendors and recurring sale operators.
          </p>

          {/* Coming Soon Icon */}
          <div className="mb-12">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-6">
              <svg
                className="w-12 h-12 text-amber-600 dark:text-amber-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div className="inline-block px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-full mb-8">
              <span className="text-amber-700 dark:text-amber-300 font-semibold text-sm">
                Coming Soon
              </span>
            </div>
          </div>

          {/* Description */}
          <p className="text-warm-600 dark:text-gray-400 mb-12 text-base leading-relaxed">
            We're building a streamlined inventory library to help you manage items across multiple sales. This feature is coming soon.
          </p>

          {/* CTA Button */}
          <Link
            href="/organizer/sales"
            className="inline-flex items-center justify-center px-8 py-3 bg-amber-600 dark:bg-amber-700 text-white font-semibold rounded-lg hover:bg-amber-700 dark:hover:bg-amber-600 transition-colors duration-200 shadow-sm hover:shadow-md"
          >
            Go to My Sales
          </Link>
        </div>
      </div>
    </>
  );
};

export default InventoryPage;
