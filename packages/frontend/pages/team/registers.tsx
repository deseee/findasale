/**
 * /team/registers -- the home for a person who works a team register at somebody
 * else's organizer account, but is not themselves an ORGANIZER.
 *
 * WHY A SEPARATE PAGE AND NOT JUST THE ORGANIZER DASHBOARD
 * Being added as a team member and granted register access (staffService.
 * grantRegisterAccess, staffService.ts:556-580) grants no role change -- the person
 * keeps roles ['USER'] (authController.ts :172). The organizer dashboard's auth guard
 * (pages/organizer/dashboard.tsx :482-484) pushes anyone without the ORGANIZER role to
 * /access-denied, so a plain team member could never see MyTeamsCard where it was
 * previously only rendered. Mirrors pages/vendor/booths.tsx, which solved the identical
 * problem for vendor booth holders -- this page has no role check, any signed-in user
 * can open it.
 *
 * Before this page existed, a team member's ONLY way to reach their granted register
 * was a raw /organizer/pos?venue=<hubId> URL someone had to hand them directly. There
 * was no button, card, or nav item anywhere in the product that got them there.
 * (2026-07-30, Patrick-directed.)
 */

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../components/AuthContext';
import MyTeamsCard from '../../components/MyTeamsCard';

const TeamRegistersPage: React.FC = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
      <Head>
        <title>Your Teams | FindA.Sale</title>
      </Head>

      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-white mb-1">Your Teams</h1>
        <p className="text-warm-600 dark:text-warm-400 mb-6">
          Every team you belong to, and the register you can open if one has been shared with you.
        </p>

        {authLoading ? (
          <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
            <p className="text-warm-600 dark:text-warm-400">Loading...</p>
          </div>
        ) : !user ? (
          <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
            <p className="text-warm-900 dark:text-warm-100 font-medium mb-1">Log in to see your teams.</p>
            <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
              Use the same account the organizer added you with.
            </p>
            <button
              onClick={() => router.push('/login?redirect=/team/registers')}
              className="w-full sm:w-auto bg-warm-900 dark:bg-warm-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
            >
              Log in
            </button>
          </div>
        ) : (
          <MyTeamsCard variant="page" />
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

export default TeamRegistersPage;
