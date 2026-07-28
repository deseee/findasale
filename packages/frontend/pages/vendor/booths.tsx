/**
 * /vendor/booths -- the home for a person who rents a booth at somebody else's market.
 *
 * WHY A SEPARATE PAGE AND NOT JUST THE ORGANIZER DASHBOARD
 * Claiming a booth grants no role: claimVendorBooth (vendorBoothController.ts :537-540)
 * writes ONLY `userId` on the VendorBooth row. A person who signed up normally has
 * roles ['USER'] (authController.ts :172). The organizer dashboard's auth guard
 * (pages/organizer/dashboard.tsx :482-484) pushes anyone without the ORGANIZER role to
 * /access-denied, so a pure vendor can never see a card placed there. This page has no
 * role check -- any signed-in user can open it -- which makes it the one surface that
 * works for BOTH a pure vendor and a vendor who also happens to be an organizer.
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import MyVendorBoothsCard from '../../components/MyVendorBoothsCard';

const VendorBoothsPage: React.FC = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
      <Head>
        <title>Your Booths | FindA.Sale</title>
      </Head>

      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-white mb-1">Your Booths</h1>
        <p className="text-warm-600 dark:text-warm-400 mb-6">
          Every booth you have claimed, and how to get back to it.
        </p>

        {authLoading ? (
          <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
            <p className="text-warm-600 dark:text-warm-400">Loading...</p>
          </div>
        ) : !user ? (
          <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
            <p className="text-warm-900 dark:text-warm-100 font-medium mb-1">Log in to see your booths.</p>
            <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
              Use the same account you claimed the booth with.
            </p>
            <button
              onClick={() => router.push('/login?redirect=/vendor/booths')}
              className="w-full sm:w-auto bg-warm-900 dark:bg-warm-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
            >
              Log in
            </button>
          </div>
        ) : (
          <MyVendorBoothsCard variant="page" />
        )}

        <p className="mt-6 text-sm text-warm-500 dark:text-warm-400">
          Looking for your own sales instead?{' '}
          <Link href="/" className="text-amber-600 hover:text-amber-700 dark:text-amber-400 font-medium">
            Go to FindA.Sale
          </Link>
        </p>
      </div>
    </div>
  );
};

export default VendorBoothsPage;
