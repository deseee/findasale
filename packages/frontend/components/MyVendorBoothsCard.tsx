/**
 * MyVendorBoothsCard -- the vendor's own booths, across every market they do not own.
 *
 * WHY THIS EXISTS
 * A vendor who claimed a booth had no route back to it. The dashboard's Market Hubs
 * card reads GET /api/organizer/hubs (hubController.ts listMyHubs :292 -- filtered to
 * `organizerId: req.user.organizerProfile.id`), so it only ever shows hubs the viewer
 * OWNS. A vendor at somebody else's market matches nothing there. Meanwhile
 * GET /api/vendor-booth/my-booths (vendorBoothController.ts listMyVendorBooths :565)
 * already returned exactly the right rows and was called from exactly one place --
 * pages/vendor-booth/[boothToken].tsx:111 -- a page you can only open if you already
 * hold the booth token. Circular. This card is the way in.
 *
 * SECURITY
 * VendorBooth.boothToken is a bearer secret: requireBoothTokenOrTeamMember()
 * (middleware/requireBoothAuth.ts :57-79) accepts it as an X-Booth-Token header and
 * grants cashier rights on the hub's cart routes. It is therefore NEVER rendered as
 * text, never a title/aria-label/data attribute, and never a React key. It appears in
 * one place only: the href of the link to the booth's own page.
 */

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from './AuthContext';

export interface MyVendorBooth {
  id: string;
  hubId: string;
  boothNumber: string;
  vendorName: string;
  status: string;
  stripeOnboarded: boolean;
  /** Bearer secret. Href only. Added to listMyVendorBooths alongside `hub`. */
  boothToken?: string | null;
  hub?: { id: string; name: string } | null;
}

interface MyVendorBoothsCardProps {
  /**
   * 'card'   -- embedded on a dashboard among other cards. Renders NOTHING while
   *             loading, on error, or when the viewer has no claimed booths, so a
   *             non-vendor never sees an empty shell or a scary error they cannot act on.
   * 'page'   -- it is the whole point of the screen, so every state is shown.
   */
  variant?: 'card' | 'page';
}

/** Plain words for VendorBooth.status (schema.prisma :5547 PENDING|CONFIRMED|REJECTED|CANCELLED). */
function statusLabel(status: string): string {
  if (status === 'CONFIRMED') return 'Confirmed';
  if (status === 'PENDING') return 'Waiting on the market';
  if (status === 'REJECTED') return 'Not accepted';
  if (status === 'CANCELLED') return 'Cancelled';
  return status;
}

function statusClasses(status: string): string {
  if (status === 'CONFIRMED') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
  }
  if (status === 'PENDING') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  }
  return 'bg-warm-100 text-warm-700 dark:bg-gray-700 dark:text-warm-300';
}

const MyVendorBoothsCard: React.FC<MyVendorBoothsCardProps> = ({ variant = 'card' }) => {
  const { user } = useAuth();

  const { data: booths = [], isLoading, isError, refetch } = useQuery<MyVendorBooth[]>({
    queryKey: ['my-vendor-booths', user?.id],
    queryFn: async () => {
      const response = await api.get('/vendor-booth/my-booths');
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const isPage = variant === 'page';

  // Embedded card: silent on every state that is not "you have booths". A user with no
  // claimed booths sees nothing at all -- not an empty card, not a spinner.
  if (!isPage && (isLoading || isError || booths.length === 0)) return null;

  if (isPage && isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
        <p className="text-warm-600 dark:text-warm-400">Loading your booths...</p>
      </div>
    );
  }

  if (isPage && isError) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
        <p className="text-warm-900 dark:text-warm-100 font-medium mb-1">We could not load your booths.</p>
        <p className="text-sm text-warm-600 dark:text-warm-400 mb-4">
          The connection may have dropped. Your booths are safe.
        </p>
        <button
          onClick={() => refetch()}
          className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  if (isPage && booths.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6">
        <p className="text-warm-900 dark:text-warm-100 font-medium mb-1">You have not claimed a booth yet.</p>
        <p className="text-sm text-warm-600 dark:text-warm-400">
          When a market gives you a booth, they send you a link by email. Open that link and claim
          the booth, and it will show up here from then on.
        </p>
      </div>
    );
  }

  const hasConfirmedBooth = booths.some((booth) => booth.status === 'CONFIRMED');

  return (
    <div className="bg-white dark:bg-gray-800 border border-warm-200 dark:border-gray-700 rounded-lg p-4 sm:p-6 mb-8">
      <div className="flex items-start gap-3 mb-4">
        <Store className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <h2 className="text-xl font-bold text-warm-900 dark:text-warm-100">Your Booths</h2>
          <p className="text-sm text-warm-600 dark:text-warm-400">
            {booths.length === 1
              ? 'A booth you rent at someone else’s market.'
              : 'Booths you rent at other people’s markets.'}
          </p>
        </div>
      </div>

      <ul className="divide-y divide-warm-200 dark:divide-gray-700">
        {booths.map((booth) => (
          <li key={booth.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-warm-900 dark:text-warm-100">
                {booth.hub?.name || 'Market'}
              </h3>
              <span
                className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${statusClasses(booth.status)}`}
              >
                {statusLabel(booth.status)}
              </span>
            </div>

            <p className="text-sm text-warm-600 dark:text-warm-400">Booth {booth.boothNumber}</p>

            {booth.status === 'PENDING' && (
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                Nothing can be sold from this booth until the market confirms it.
              </p>
            )}

            <p
              className={`mt-1 text-sm ${
                booth.stripeOnboarded
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-warm-700 dark:text-warm-300'
              }`}
            >
              {booth.stripeOnboarded
                ? 'Payouts connected'
                : 'Payouts not set up yet. Open your booth to finish it.'}
            </p>

            {/* boothToken lives in this href and nowhere else on the page. */}
            {booth.boothToken ? (
              <Link
                href={`/vendor-booth/${booth.boothToken}`}
                className="mt-3 block w-full sm:w-auto sm:inline-block text-center bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                Open your booth
              </Link>
            ) : (
              <p className="mt-3 text-sm text-warm-500 dark:text-warm-400">
                Use the booth link the market emailed you to open this booth.
              </p>
            )}
          </li>
        ))}
      </ul>

      {hasConfirmedBooth && (
        <div className="mt-4 pt-4 border-t border-warm-200 dark:border-gray-700">
          <h3 className="text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">About the register</h3>
          <p className="text-sm text-warm-600 dark:text-warm-400">
            The register at a market is run by the market&rsquo;s own staff. If you are ever handed
            it, your own booth&rsquo;s items still cannot be in that sale. The system stops the whole
            sale so one person is never both the seller and the cashier. Running the register for
            other booths does not earn you anything today.
          </p>
        </div>
      )}
    </div>
  );
};

export default MyVendorBoothsCard;
