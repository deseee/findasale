import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useOrganizerTier } from '../../hooks/useOrganizerTier';

interface ConsignorStatus {
  consignorId: string;
  name: string;
  email?: string;
  stripeOnboarded: boolean;
  accountStatus?: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    status: string;
  };
}

// FIX 2026-09-08: both POST handlers below (handleInviteToACH, handleInviteToSquare) use
// plain fetch() rather than the app-wide `api` axios wrapper (lib/api.ts), so neither ever
// attached the double-submit x-csrf-token header the backend's CSRF middleware requires for
// any cookie-authenticated state-mutating request (packages/backend/src/middleware/csrf.ts).
// This was masked until now by the separate consignorId-undefined bug (fixed 2026-09-07,
// see loadConsignors above) -- with a real consignor ID now reaching the request, this second,
// previously-invisible bug surfaced live: POST /api/stripe-connect/onboard/<realId> -> 403
// "CSRF token validation failed", confirmed in this session's re-verification pass. Minimal
// targeted fix: read the csrf-token cookie the same way lib/api.ts's interceptor does, and
// attach it manually, rather than migrating this whole file off fetch().
const getCsrfHeader = (): Record<string, string> => {
  if (typeof document === 'undefined') return {};
  const csrfToken = document.cookie
    .split('; ')
    .find((row) => row.startsWith('csrf-token='))
    ?.split('=')[1];
  return csrfToken ? { 'x-csrf-token': csrfToken } : {};
};

const ACHPayoutsPage: React.FC = () => {
  const router = useRouter();
  const { canAccess, tierLoading } = useOrganizerTier();
  const [consignors, setConsignors] = useState<ConsignorStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { consignorId, success, refresh } = router.query;

  // Square is the sole payout processor for consignors. Stripe onboarding removed
  // 2026-09-09 -- the Stripe platform account is permanently closed. Supersedes the
  // 2026-09-07 "Stripe stays available" decision. Keyed by consignorId since this page
  // lists many consignors at once. See
  // claude_docs/feature-notes/square-connect-ux-entry-points-and-flows-2026-09-07.md
  const [squareStatuses, setSquareStatuses] = useState<
    Record<string, { squareAccountId: string | null; squareOnboarded: boolean; payoutsFlaggedForReview: boolean }>
  >({});
  const [squareInviting, setSquareInviting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // If returning from Stripe, update that consignor's status
    if (consignorId && (success || refresh)) {
      handleReturnFromStripe(consignorId as string);
    }

    // Load all consignors for workspace
    loadConsignors();
  }, []);

  // Square's OAuth callback is a single fixed URL with no return-to-origin mechanism for this
  // page (see square-oauth-callback.tsx's REDIRECT_TARGET map), so this page can't rely on a
  // same-tab redirect back here the way handleReturnFromStripe above does. Instead, fetch every
  // listed consignor's Square status directly whenever the consignor list changes -- this both
  // seeds the initial badges and re-syncs after the poll in handleInviteToSquare fires.
  useEffect(() => {
    consignors.forEach((c) => {
      void refreshSquareStatus(c.consignorId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consignors]);

  const refreshSquareStatus = async (cId: string) => {
    try {
      const response = await fetch(`/api/square-connect/consignor/${cId}/status`);
      if (!response.ok) return;
      const data = await response.json();
      setSquareStatuses((prev) => ({
        ...prev,
        [cId]: {
          squareAccountId: data.squareAccountId ?? null,
          squareOnboarded: !!data.squareOnboarded,
          payoutsFlaggedForReview: !!data.payoutsFlaggedForReview,
        },
      }));
    } catch (err) {
      // Best-effort -- the badge just won't update until the next successful poll or reload.
      console.error('Error checking consignor Square status:', err);
    }
  };

  const handleReturnFromStripe = async (cId: string) => {
    try {
      const response = await fetch(`/api/stripe-connect/return/${cId}`, {
        method: 'GET',
      });
      if (!response.ok) throw new Error('Failed to verify onboarding');
      const data = await response.json();
    } catch (err) {
      console.error('Error verifying onboarding:', err);
    }
  };

  const loadConsignors = async () => {
    try {
      setLoading(true);
      // This endpoint should be created in a consignor controller
      // For now, we'll fetch from settlement hub context
      const response = await fetch('/api/consignors', {
        method: 'GET',
      });
      if (!response.ok) throw new Error('Failed to load consignors');
      const data = await response.json();
      // FIX 2026-09-07: backend returns Prisma's raw `id` field, but every consumer on this
      // page (both the pre-existing Stripe button and today's new Square button) reads
      // `consignor.consignorId` -- which was always undefined, silently breaking both
      // "Set Up Payouts" buttons (confirmed live: GET /api/square-connect/consignor/undefined/status
      // 404, caught during this session's post-ship QA pass). Map id -> consignorId here rather
      // than touching the 11 other render-site references, to keep this a minimal, targeted fix.
      setConsignors(data.map((c: any) => ({ ...c, consignorId: c.id })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load consignors');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteToSquare = async (cId: string) => {
    setSquareInviting((prev) => ({ ...prev, [cId]: true }));
    try {
      const response = await fetch(`/api/square-connect/consignor/${cId}/onboard`, {
        method: 'POST',
        headers: getCsrfHeader(),
      });
      if (!response.ok) throw new Error('Failed to generate Square onboarding link');
      const data = await response.json();

      if (data.alreadyOnboarded) {
        setSquareStatuses((prev) => ({
          ...prev,
          [cId]: {
            squareAccountId: data.squareAccountId ?? prev[cId]?.squareAccountId ?? null,
            squareOnboarded: true,
            payoutsFlaggedForReview: prev[cId]?.payoutsFlaggedForReview || false,
          },
        }));
        return;
      }

      if (data.onboardingUrl) {
        // Open in a new tab and poll for the result -- Square has one fixed OAuth redirect URL
        // (unlike Stripe's per-request return_url), so this tab can't wait for a same-tab
        // redirect back. Same pattern as HubOwnerStripeOnboarding.tsx's Square-equivalent poll.
        window.open(data.onboardingUrl, '_blank');
        window.setTimeout(() => refreshSquareStatus(cId), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite consignor to Square');
    } finally {
      setSquareInviting((prev) => ({ ...prev, [cId]: false }));
    }
  };

  // Show loading state while tier is being determined
  if (tierLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  // Gate: TEAMS tier only
  if (!canAccess('TEAMS')) {
    return (
      <>
        <Head>
          <title>Upgrade to TEAMS - FindA.Sale</title>
        </Head>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
          <div className="max-w-2xl mx-auto">
            <div className="mb-8">
              <Link href="/organizer/payouts" className="text-blue-600 hover:text-blue-700 text-sm mb-4 inline-block">
                  ← Back to Settlement Hub
                </Link>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-700 rounded-lg p-8 text-center">
              <h2 className="text-2xl font-bold text-amber-900 dark:text-amber-100 mb-3">TEAMS Subscription Required</h2>
              <p className="text-amber-800 dark:text-amber-200 mb-6">
                Consignor payouts are available only for TEAMS tier subscribers.
                Upgrade to unlock direct payout management for your consignors.
              </p>
              <Link href="/organizer/subscription" className="inline-block px-6 py-3 bg-amber-600 dark:bg-amber-700 text-white rounded-lg hover:bg-amber-700 dark:hover:bg-amber-800 transition font-medium">
                  Upgrade to TEAMS
                </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading consignors...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Consignor Payouts - FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link href="/organizer/payouts" className="text-blue-600 hover:text-blue-700 text-sm mb-4 inline-block">
                ← Back to Settlement Hub
              </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Consignor Payouts</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Send payouts directly to your consignors' bank accounts. Transfers are processed within 1–2 business days.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
              ✓ Consignor onboarding completed! They can now receive payouts.
            </div>
          )}

          {/* Consignors list */}
          {consignors.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
              <p className="text-gray-600 dark:text-gray-400 mb-4">No consignors yet.</p>
              <Link href="/organizer/payouts" className="text-blue-600 hover:text-blue-700">Go to Settlement Hub</Link>
            </div>
          ) : (
            <div className="space-y-4">
              {consignors.map((consignor) => (
                <div
                  key={consignor.consignorId}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                >
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">{consignor.name}</h3>
                    {consignor.email && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">{consignor.email}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {squareStatuses[consignor.consignorId]?.squareOnboarded ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                          ✓ Ready to Receive Payouts (Square)
                        </span>
                      ) : squareStatuses[consignor.consignorId]?.squareAccountId ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                          ⚠ Pending Onboarding (Square)
                        </span>
                      ) : null}
                    </div>
                    {squareStatuses[consignor.consignorId]?.squareAccountId &&
                      !squareStatuses[consignor.consignorId]?.squareOnboarded && (
                        <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 max-w-md">
                          <p className="text-xs text-amber-800 dark:text-amber-200">
                            Their Square account setup isn't fully finished on Square's side yet. They
                            may need to complete a few more steps in Square before payouts can go
                            through.
                          </p>
                        </div>
                      )}
                    {squareStatuses[consignor.consignorId]?.payoutsFlaggedForReview && (
                      <div className="mt-2 rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-3 max-w-md">
                        <p className="text-xs text-blue-800 dark:text-blue-200">
                          As a routine precaution, our team is taking a quick look at this account
                          before payouts begin. No action is needed.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                    {!squareStatuses[consignor.consignorId]?.squareOnboarded && (
                      <button
                        onClick={() => handleInviteToSquare(consignor.consignorId)}
                        disabled={!!squareInviting[consignor.consignorId]}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        {squareInviting[consignor.consignorId] ? 'Connecting…' : 'Set Up Payouts (Square)'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Info box */}
          <div className="mt-12 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">How Consignor Payouts Work</h3>
            <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
              <li>• Consignors complete a quick one-time Square account setup</li>
              <li>• Payouts are sent directly to their linked bank account</li>
              <li>• Transfers typically arrive within 1–2 business days</li>
              <li>• Available on TEAMS tier only</li>
            </ul>
          </div>

          {/* Compliance notes */}
          <div className="mt-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-4 text-xs text-gray-600 dark:text-gray-400">
            <p className="mb-2">
              <strong>Compliance:</strong> Consignors may be required to complete identity verification as part of
              Square onboarding. 1099-NEC tax reporting required for consignors earning $600+/year.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default ACHPayoutsPage;
