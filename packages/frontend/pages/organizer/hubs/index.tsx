/**
 * Flea Market Events — Organizer Hub Dashboard
 *
 * Feature #40 repurposed per ADR-014: Sale Hubs → Flea Market Events (TEAMS tier)
 * Route: /organizer/hubs
 * 4 event types: FLEA_MARKET, ANTIQUE_MALL, POPUP_MARKET, FARMERS_MARKET
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../components/AuthContext';
import TierGate from '../../../components/TierGate';
import { useDeleteHub, useReopenHub } from '../../../hooks/useHubs';
import api from '../../../lib/api';

interface HubEvent {
  id: string;
  name: string;
  slug: string;
  saleDate?: string;
  eventName?: string;
  boothCount: number;
  // Booths a vendor has claimed that this organizer has not confirmed yet. Optional so an
  // older API response renders as zero rather than NaN. Served by hubController.listMyHubs.
  awaitingConfirmationCount?: number;
  // The other three close-a-market blockers, same source. hubController.deleteHub refuses
  // with 409 HUB_NOT_EMPTY on exactly these four numbers, so the button below must read the
  // same ones or it would offer an action the server then rejects.
  confirmedBoothCount?: number;
  openCartCount?: number;
  unfinishedPayoutCount?: number;
  canClose?: boolean;
  // false once the market has been closed. deleteHub is a soft close (isActive: false), and
  // listMyHubs returns closed markets too, so the list has to separate them itself.
  isActive?: boolean;
}

interface CloseBlockerCounts {
  confirmedBoothCount: number;
  awaitingConfirmationCount: number;
  openCartCount: number;
  unfinishedPayoutCount: number;
}

const countsFrom = (source?: Partial<CloseBlockerCounts>): CloseBlockerCounts => ({
  confirmedBoothCount: source?.confirmedBoothCount ?? 0,
  awaitingConfirmationCount: source?.awaitingConfirmationCount ?? 0,
  openCartCount: source?.openCartCount ?? 0,
  unfinishedPayoutCount: source?.unfinishedPayoutCount ?? 0,
});

// One plain sentence per thing standing in the way. Singular and plural are written out
// rather than bolted on with (s) -- this reads out loud to a 70-year-old market organizer.
const blockerLines = (c: CloseBlockerCounts): string[] => {
  const lines: string[] = [];
  if (c.confirmedBoothCount === 1) {
    lines.push('1 vendor booth is confirmed. That vendor can still sell here.');
  } else if (c.confirmedBoothCount > 1) {
    lines.push(`${c.confirmedBoothCount} vendor booths are confirmed. Those vendors can still sell here.`);
  }
  if (c.awaitingConfirmationCount === 1) {
    lines.push('1 vendor has claimed a booth and is waiting for your answer.');
  } else if (c.awaitingConfirmationCount > 1) {
    lines.push(`${c.awaitingConfirmationCount} vendors have claimed a booth and are waiting for your answer.`);
  }
  if (c.openCartCount === 1) {
    lines.push('1 register sale is still open.');
  } else if (c.openCartCount > 1) {
    lines.push(`${c.openCartCount} register sales are still open.`);
  }
  if (c.unfinishedPayoutCount === 1) {
    lines.push('1 vendor payout has not finished.');
  } else if (c.unfinishedPayoutCount > 1) {
    lines.push(`${c.unfinishedPayoutCount} vendor payouts have not finished.`);
  }
  return lines;
};

// Every branch says what changed (nothing) and what to do next. The old pattern here was a
// single grey "Unable to load events" box, which tells an organizer nothing they can act on.
const marketActionFailure = (err: any): string => {
  const status = err?.status;
  const code = err?.code;
  if (code === 'GRACE_PERIOD_RESTRICTION') {
    return 'Your plan is in its grace period, so market changes are switched off. Nothing was changed. Renew your plan, then try again.';
  }
  if (code === 'TIER_REQUIRED') {
    return 'Your plan does not include market hubs right now, so this cannot be done. Nothing was changed. Open your plan page to upgrade, then try again.';
  }
  if (status === 403) {
    return 'This market belongs to a different account. Nothing was changed. Sign in with the account that created it.';
  }
  if (status === 401) {
    return 'You have been signed out. Nothing was changed. Sign in again, then try once more.';
  }
  if (status === 404) {
    return 'This market is no longer here. Nothing was changed. Refresh this page to see your current list.';
  }
  if (status === 429) {
    return 'Too many tries in a row. Nothing was changed. Wait one minute, then try again.';
  }
  return 'The server did not answer. Nothing was changed. Wait a minute and try again. If it keeps failing, email support@finda.sale.';
};

const ACTION_BUTTON = 'inline-flex items-center justify-center min-h-[48px] px-5 py-3 text-base font-semibold rounded-lg transition-colors';

/**
 * Confirmation step for closing a market.
 *
 * Mounted only when a market is picked, and keyed on its id, so useDeleteHub(hub.id) is
 * built with the final id on its very first render. Calling the hook up in the list with a
 * changing id would depend on react-query refreshing its mutation options before the
 * organizer's click lands.
 */
function CloseMarketDialog({
  hub,
  onCancel,
  onClosed,
}: {
  hub: HubEvent;
  onCancel: () => void;
  onClosed: (name: string) => void;
}) {
  const deleteHub = useDeleteHub(hub.id);
  const [serverBlockers, setServerBlockers] = useState<CloseBlockerCounts | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const counts = serverBlockers ?? countsFrom(hub);
  const lines = blockerLines(counts);
  const blocked = lines.length > 0;

  const handleConfirm = async () => {
    setFailure(null);
    try {
      await deleteHub.mutateAsync();
      onClosed(hub.name);
    } catch (err: any) {
      // The server re-checks the same four counts. If a vendor claimed a booth between the
      // page load and this click, swap to the blocked panel using the server's fresh numbers
      // rather than showing a red box over stale ones.
      if (err?.status === 409 && err?.blockers) {
        setServerBlockers(countsFrom(err.blockers));
        setFailure('Something changed while you were reading this. Here is what is in the way now.');
        return;
      }
      setFailure(marketActionFailure(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-market-title"
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6"
      >
        <h2 id="close-market-title" className="text-xl font-bold text-warm-900 dark:text-gray-100">
          {blocked ? 'You cannot close this market yet' : 'Close this market?'}
        </h2>
        <p className="mt-1 mb-4 text-lg font-bold text-warm-900 dark:text-gray-100 break-words">
          {hub.name}
        </p>

        {failure && (
          <p
            role="alert"
            className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-base text-red-800 dark:text-red-200"
          >
            {failure}
          </p>
        )}

        {blocked ? (
          <div className="text-base text-warm-800 dark:text-gray-200 space-y-3">
            <p>Other people are counting on this market. Here is what is in the way:</p>
            <ul className="list-disc pl-5 space-y-2 font-medium">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p>
              Sort those out first. Closing now would pull the market out from under a vendor who is
              still trading in it.
            </p>
          </div>
        ) : (
          <div className="text-base text-warm-800 dark:text-gray-200 space-y-3">
            <p>This takes the market off FindA.Sale. Shoppers will not find it any more.</p>
            <p>
              Nothing is erased. Every sale already recorded, every payout and every receipt stays
              exactly as it is. You keep your records.
            </p>
            <p>Empty booth spots stay with the market. If you reopen it, they come back.</p>
            <p>You can reopen this market yourself from this page at any time.</p>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className={`${ACTION_BUTTON} flex-1 bg-warm-200 hover:bg-warm-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-warm-900 dark:text-gray-100`}
          >
            {blocked ? 'Go back' : 'Keep it open'}
          </button>
          {blocked ? (
            <Link
              href={`/organizer/hubs/${hub.id}/vendor-booths`}
              className={`${ACTION_BUTTON} flex-1 bg-amber-700 hover:bg-amber-800 text-white`}
            >
              Go to the vendor booths
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={deleteHub.isPending}
              className={`${ACTION_BUTTON} flex-1 bg-red-700 hover:bg-red-800 disabled:bg-red-400 text-white`}
            >
              {deleteHub.isPending ? 'Closing...' : 'Yes, close it'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Reopen button for a closed market. Its own component for the same reason as the dialog
 * above: useReopenHub(hub.id) is built with the right id on first render.
 */
function ReopenMarketButton({
  hub,
  onReopened,
  onFailed,
}: {
  hub: HubEvent;
  onReopened: (name: string) => void;
  onFailed: (message: string) => void;
}) {
  const reopenHub = useReopenHub(hub.id);

  const handleReopen = async () => {
    try {
      await reopenHub.mutateAsync();
      onReopened(hub.name);
    } catch (err: any) {
      onFailed(marketActionFailure(err));
    }
  };

  return (
    <button
      type="button"
      onClick={handleReopen}
      disabled={reopenHub.isPending}
      className={`${ACTION_BUTTON} w-full sm:w-auto bg-sage-700 hover:bg-sage-600 disabled:bg-sage-300 text-white`}
    >
      {reopenHub.isPending ? 'Reopening...' : 'Reopen this market'}
    </button>
  );
}

const EVENT_TYPES = [
  {
    key: 'FLEA_MARKET',
    title: 'Flea Market',
    description: 'Classic multi-vendor outdoor/indoor market',
    icon: '🏪',
    color: 'amber',
  },
  {
    key: 'ANTIQUE_MALL',
    title: 'Antique Mall',
    description: 'Curated antique and vintage dealer showcase',
    icon: '🏛️',
    color: 'warm',
  },
  {
    key: 'POPUP_MARKET',
    title: 'Popup Market',
    description: 'Temporary themed market events',
    icon: '🎪',
    color: 'sage',
  },
  {
    key: 'FARMERS_MARKET',
    title: 'Farmers Market',
    description: 'Local produce and artisan goods market',
    icon: '🌽',
    color: 'green',
  },
];

export default function FleaMarketEventsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [closingHub, setClosingHub] = useState<HubEvent | null>(null);
  // A banner, not a toast. A toast disappears on its own, and this list is the one place an
  // organizer needs to be certain what just happened to their market.
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await api.get('/organizer/hubs');
      const data = res.data;
      setEvents(data?.hubs || []);
      setEventsError(null);
    } catch (err: any) {
      // Gracefully handle JSON parse errors or missing endpoints
      console.warn('[hubs] Failed to fetch events:', err?.message);
      setEvents([]);
      // Only show error if it's not a parse/404 issue
      if (err?.response?.status && err.response.status !== 404) {
        setEventsError('Unable to load events. The feature is being updated.');
      }
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchEvents();
    }
  }, [user, fetchEvents]);

  // The Hub Details page sends the organizer here with ?close=<hubId> so the confirmation
  // step lives in exactly one place. Waits for the list so the dialog can name the market
  // and read its four blocker counts.
  useEffect(() => {
    const requested = router.query.close;
    if (typeof requested !== 'string' || events.length === 0) return;
    const match = events.find((event) => event.id === requested);
    if (match && match.isActive !== false) {
      setClosingHub(match);
    }
    router.replace('/organizer/hubs', undefined, { shallow: true });
  }, [router, events]);

  const handleClosed = (name: string) => {
    setClosingHub(null);
    setNotice({
      kind: 'success',
      text: `${name} is closed. It is off the public site and your records are safe. You can reopen it from the Closed markets list below.`,
    });
    queryClient.invalidateQueries({ queryKey: ['hubs'] });
    fetchEvents();
  };

  const handleReopened = (name: string) => {
    setNotice({ kind: 'success', text: `${name} is open again. Shoppers can find it.` });
    queryClient.invalidateQueries({ queryKey: ['hubs'] });
    fetchEvents();
  };

  const handleActionFailed = (text: string) => {
    setNotice({ kind: 'error', text });
  };

  const openEvents = events.filter((event) => event.isActive !== false);
  const closedEvents = events.filter((event) => event.isActive === false);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
      </div>
    );
  }

  if (!user?.roles?.includes('ORGANIZER')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-warm-900 dark:text-gray-100 mb-4">Access Denied</h1>
          <p className="text-warm-600 dark:text-gray-400 mb-6">You must be an organizer to manage events.</p>
          <Link href="/" className="text-amber-600 hover:text-amber-700 font-medium">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Market Hubs - FindA.Sale</title>
        <meta name="description" content="Organize multi-vendor market events" />
      </Head>

      <TierGate requiredTier="TEAMS" featureName="Market Hubs" description="Organize multi-vendor events like flea markets, antique malls, popup markets, and farmers markets.">
        <div className="min-h-screen bg-warm-50 dark:bg-gray-900">
          {/* Header */}
          <div className="bg-white dark:bg-gray-800 border-b border-warm-200 dark:border-gray-700 px-4 py-4 mb-8">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center gap-3 mb-1">
                <Link
                  href="/organizer/dashboard"
                  className="text-warm-400 hover:text-warm-600 dark:text-gray-400 dark:hover:text-gray-300 text-sm"
                >
                  ← Dashboard
                </Link>
                <span className="text-warm-300 dark:text-gray-600">/</span>
                <h1 className="text-lg font-semibold text-warm-900 dark:text-gray-100">
                  Market Hubs
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                  Work in progress
                </span>
              </div>
              <p className="text-sm text-warm-600 dark:text-gray-400">
                Organize multi-vendor events — flea markets, antique malls, popup markets, and farmers markets
              </p>
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-4 pb-12">
            {/* Event Type Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {EVENT_TYPES.map((type) => (
                <div
                  key={type.key}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-5 hover:border-amber-300 dark:hover:border-amber-600 transition-colors"
                >
                  <div className="text-3xl mb-3">{type.icon}</div>
                  <h3 className="text-base font-semibold text-warm-900 dark:text-gray-100 mb-1">
                    {type.title}
                  </h3>
                  <p className="text-sm text-warm-600 dark:text-gray-400">
                    {type.description}
                  </p>
                </div>
              ))}
            </div>

            {/* Create Event CTA */}
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-6 mb-8">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-100 mb-1">
                    Ready to host a multi-vendor event?
                  </h2>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Set up booths, invite vendors, and manage payouts — all from one dashboard.
                  </p>
                </div>
                <Link
                  href="/organizer/hubs/create"
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold transition-colors"
                >
                  Create Hub
                </Link>
              </div>
            </div>

            {/* Features Preview */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-6 mb-8">
              <h2 className="text-lg font-semibold text-warm-900 dark:text-gray-100 mb-4">
                What&apos;s coming
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm font-medium text-warm-900 dark:text-gray-100 mb-1">Unlimited Booths</p>
                  <p className="text-sm text-warm-600 dark:text-gray-400">
                    Invite as many vendors as you want. Each gets their own booth, inventory, and checkout.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-warm-900 dark:text-gray-100 mb-1">Flexible Payouts</p>
                  <p className="text-sm text-warm-600 dark:text-gray-400">
                    Choose your model: flat booth fee, revenue share, or a hybrid of both.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-warm-900 dark:text-gray-100 mb-1">QR Auto-Settlement</p>
                  <p className="text-sm text-warm-600 dark:text-gray-400">
                    Shoppers scan, pay, and go. Vendor payouts are calculated and sent automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Your Events Section */}
            <div>
              <h2 className="text-lg font-semibold text-warm-900 dark:text-gray-100 mb-4">
                Your Events
              </h2>

              {notice && (
                <div
                  role={notice.kind === 'error' ? 'alert' : 'status'}
                  className={`mb-4 p-4 rounded-lg border-2 text-base ${
                    notice.kind === 'error'
                      ? 'bg-red-50 dark:bg-red-900/30 border-red-400 dark:border-red-700 text-red-900 dark:text-red-100'
                      : 'bg-success-50 dark:bg-green-900/30 border-success-600 dark:border-green-700 text-warm-900 dark:text-green-50'
                  }`}
                >
                  <p>{notice.text}</p>
                  <button
                    type="button"
                    onClick={() => setNotice(null)}
                    className="mt-3 min-h-[48px] px-4 py-2 text-base font-semibold underline text-warm-900 dark:text-gray-100"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {eventsLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 h-20 animate-pulse" />
                  ))}
                </div>
              ) : eventsError ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-8 text-center">
                  <p className="text-warm-500 dark:text-gray-400 text-sm">{eventsError}</p>
                </div>
              ) : openEvents.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-8 text-center">
                  <p className="text-2xl mb-3">🎪</p>
                  <p className="text-warm-900 dark:text-gray-100 font-medium mb-1">No events yet</p>
                  <p className="text-sm text-warm-500 dark:text-gray-400">
                    Create your first multi-vendor event to get started.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {openEvents.map((event) => (
                    <div
                      key={event.id}
                      className="bg-white dark:bg-gray-800 rounded-lg border border-warm-200 dark:border-gray-700 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <h3 className="font-medium text-warm-900 dark:text-gray-100">{event.name}</h3>
                        <p className="text-sm text-warm-500 dark:text-gray-400">
                          {event.boothCount} {event.boothCount === 1 ? 'vendor' : 'vendors'}
                          {event.saleDate && <> · {new Date(event.saleDate).toLocaleDateString()}</>}
                        </p>
                        {(event.awaitingConfirmationCount ?? 0) > 0 && (
                          <p className="mt-1 text-sm font-bold text-amber-700 dark:text-amber-400">
                            {event.awaitingConfirmationCount} booth
                            {event.awaitingConfirmationCount === 1 ? '' : 's'} awaiting your confirmation
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:shrink-0">
                        <Link
                          href={`/organizer/hubs/${event.id}/vendor-booths`}
                          className={`${ACTION_BUTTON} w-full sm:w-auto bg-amber-700 hover:bg-amber-800 text-white`}
                        >
                          {(event.awaitingConfirmationCount ?? 0) > 0 ? 'Confirm booths' : 'Manage'}
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setNotice(null);
                            setClosingHub(event);
                          }}
                          className={`${ACTION_BUTTON} w-full sm:w-auto border-2 border-warm-300 dark:border-gray-500 bg-white dark:bg-gray-700 text-warm-900 dark:text-gray-100 hover:bg-warm-100 dark:hover:bg-gray-600`}
                        >
                          Close this market
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Closed markets. deleteHub only sets isActive: false and listMyHubs still
                  returns those rows, so without this section a closed market would sit in
                  the main list looking exactly like an open one. */}
              {closedEvents.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-base font-semibold text-warm-900 dark:text-gray-100 mb-2">
                    Closed markets
                  </h3>
                  <p className="text-sm text-warm-600 dark:text-gray-400 mb-3">
                    These are off the public site. Shoppers cannot find them. Your records are kept.
                  </p>
                  <div className="space-y-3">
                    {closedEvents.map((event) => (
                      <div
                        key={event.id}
                        className="bg-warm-100 dark:bg-gray-800/60 rounded-lg border border-warm-300 dark:border-gray-600 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <h4 className="font-medium text-warm-900 dark:text-gray-100">
                            {event.name}
                          </h4>
                          <p className="text-sm text-warm-600 dark:text-gray-400">
                            Closed · {event.boothCount} {event.boothCount === 1 ? 'booth' : 'booths'} kept
                          </p>
                        </div>
                        <ReopenMarketButton
                          hub={event}
                          onReopened={handleReopened}
                          onFailed={handleActionFailed}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {closingHub && (
          <CloseMarketDialog
            key={closingHub.id}
            hub={closingHub}
            onCancel={() => setClosingHub(null)}
            onClosed={handleClosed}
          />
        )}
      </TierGate>
    </>
  );
}
