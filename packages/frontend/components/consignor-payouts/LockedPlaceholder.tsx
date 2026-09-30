import React from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';

/**
 * Static locked state for organizers below TEAMS. It is deliberately NOT TierGate: TierGate
 * mounts the real page under a blur, which fires the real requests and error toasts for
 * organizers who cannot use the feature. This renders no data and makes no requests.
 */
const LockedPlaceholder: React.FC<{ tierKnown?: boolean }> = ({ tierKnown = true }) => (
  <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
    <div className="max-w-xl mx-auto mt-8">
      <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-xl p-6 sm:p-8 text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
          <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-warm-900 dark:text-white mb-2">Consignor payouts</h1>
        {tierKnown ? (
          <>
            <p className="text-warm-600 dark:text-warm-400 mb-6">
              Consignor payouts are part of TEAMS. Upgrade to work out payouts for every consignor in
              one place.
            </p>
            <Link
              href="/organizer/subscription"
              className="inline-flex items-center justify-center min-h-[44px] px-5 py-2 rounded-lg font-bold text-sm bg-amber-600 hover:bg-amber-700 text-white transition-colors"
            >
              See plans
            </Link>
          </>
        ) : (
          <p className="text-warm-600 dark:text-warm-400">
            We could not confirm your plan just now. Refresh the page to try again.
          </p>
        )}
      </div>
    </div>
  </div>
);

export default LockedPlaceholder;
