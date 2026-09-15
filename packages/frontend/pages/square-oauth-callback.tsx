import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import api from '../lib/api';

/**
 * pages/square-oauth-callback.tsx
 * (2026-09-07, Square-replaces-Stripe migration, Wave 1 dispatch #2 -- frontend half)
 *
 * Square requires exactly ONE fixed OAuth redirect URL per application (registered once
 * in the Developer Dashboard), unlike Stripe's accountLinks which take a per-request
 * return_url. That means every "Connect your Square account" flow -- organizer, consignor,
 * hub-owner, vendor-booth operator -- lands here, regardless of who started it.
 * `/square-oauth-callback` is that fixed URL; the path must not change once registered.
 *
 * Square appends either `code`+`state` (merchant approved) or `error`+`error_description`
 * (merchant declined) to this URL. This page never inspects `state` itself -- it's an
 * opaque, single-use round-trip value that only squareConnectController.ts's
 * handleSquareConnectCallback decodes (see squareConnectService.ts for why `state` is not
 * a security boundary here). This page's only job is: read the query params once, make one
 * authenticated call to POST /api/square-connect/callback, and show the result.
 *
 * Auth: this project's API auth is a cookie-based JWT proxied through Next's own /api
 * rewrite (see next.config.js's `railwayApi` rewrite + lib/api.ts's withCredentials:true +
 * baseURL:'/api' on the client) -- the same pattern organizer/payouts.tsx and
 * pay-square/[cartId].tsx already use via `import api from '../../lib/api'`. No manual
 * Authorization header is needed or correct here.
 *
 * Security note: the OAuth `code` is read from the URL, sent to the backend exactly once
 * (in a ref, purely in-memory, never localStorage/sessionStorage), and the URL itself is
 * scrubbed via router.replace() immediately so a refresh or a shared/bookmarked link can
 * never resubmit it.
 */

type PageState = 'loading' | 'success' | 'declined' | 'missing' | 'error';

interface SquareCallbackResult {
  ownerType: 'ORGANIZER' | 'CONSIGNOR' | 'VENDOR_BOOTH';
  ownerId: string;
  squareMerchantId: string | null;
  squareOnboarded: boolean;
  squareLocationId: string | null;
  payoutsFlaggedForReview: boolean;
  tokenPersisted: boolean;
}

const REDIRECT_DELAY_MS = 1500;

// Where a successful connection sends the user next.
//
// FLAGGED (see this dispatch's handoff, Blocked/Flagged): the task spec named
// /organizer/settlement as the organizer payout hub, but that path is NOT a real page --
// packages/frontend/pages/organizer/settlement/ only contains [saleId].tsx (a sale-scoped
// dynamic route), so the bare /organizer/settlement URL 404s (verified via `ls` this
// session; organizer/stripe-connect.tsx's own "Back to Settlement Hub" link has the same
// pre-existing issue and was left as-is -- not this dispatch's file to fix).
// /organizer/payouts DOES exist as a real page and is the closest confirmed organizer
// payout/settings hub, so it's used here for both ORGANIZER and CONSIGNOR -- consignor
// Square onboarding is completed inside the ORGANIZER's own authenticated session (same
// posture as the Stripe consignor-ACH flow in organizer/stripe-connect.tsx), and no
// Square-specific consignor-facing settings page exists yet (confirmed: no frontend file
// references squareOnboarded/squareMerchantId/square-connect anywhere before this dispatch).
const REDIRECT_TARGET: Partial<Record<SquareCallbackResult['ownerType'], string>> = {
  ORGANIZER: '/organizer/payouts',
  CONSIGNOR: '/organizer/payouts',
};

const OWNER_LABEL: Record<SquareCallbackResult['ownerType'], string> = {
  ORGANIZER: 'your organizer account',
  CONSIGNOR: 'your consignor payout account',
  VENDOR_BOOTH: 'your booth',
};

export default function SquareOAuthCallbackPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [result, setResult] = useState<SquareCallbackResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [declineMessage, setDeclineMessage] = useState('');
  const hasHandled = useRef(false);
  // In-memory only (never localStorage/sessionStorage) -- kept solely so the "Try Again"
  // button on a network-failure error can re-send the SAME code/state once, without
  // re-reading them from the (already-scrubbed) URL.
  const pendingCodeRef = useRef<{ code: string; state: string } | null>(null);

  useEffect(() => {
    if (!router.isReady || hasHandled.current) return;
    hasHandled.current = true;

    const { code, state: oauthState, error, error_description: errorDescription } = router.query;

    // Scrub the OAuth params from the address bar/history immediately. The code is
    // single-use; nothing about it should be reloadable, bookmarkable, or left visible.
    router.replace('/square-oauth-callback', undefined, { shallow: true });

    if (typeof error === 'string' && error) {
      setDeclineMessage(
        typeof errorDescription === 'string' && errorDescription.trim()
          ? errorDescription
          : 'Square connection was cancelled or declined.'
      );
      setPageState('declined');
      return;
    }

    if (typeof code === 'string' && code && typeof oauthState === 'string' && oauthState) {
      pendingCodeRef.current = { code, state: oauthState };
      void completeConnection(code, oauthState);
      return;
    }

    setPageState('missing');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const completeConnection = async (code: string, oauthState: string) => {
    setPageState('loading');
    setErrorMessage('');
    try {
      const response = await api.post('/square-connect/callback', { code, state: oauthState });
      const data = response.data as SquareCallbackResult;
      pendingCodeRef.current = null; // the code has now been used -- retry can no longer use it
      setResult(data);
      setPageState('success');

      const target = REDIRECT_TARGET[data.ownerType];
      if (target) {
        window.setTimeout(() => {
          router.push(target);
        }, REDIRECT_DELAY_MS);
      }
    } catch (err: any) {
      console.error('[square-oauth-callback] Failed to complete Square connection:', err);
      const backendMessage = err?.response?.data?.message;
      setErrorMessage(
        typeof backendMessage === 'string' && backendMessage.trim()
          ? backendMessage
          : 'We could not finish connecting your Square account. Please try again.'
      );
      setPageState('error');
    }
  };

  const handleRetry = () => {
    if (pendingCodeRef.current) {
      void completeConnection(pendingCodeRef.current.code, pendingCodeRef.current.state);
    } else {
      // The code was already consumed (or never existed) -- a fresh connection has to be
      // started over from wherever the "Connect Square" action lives, not from here.
      router.back();
    }
  };

  const handleContinue = () => {
    if (result) {
      const target = REDIRECT_TARGET[result.ownerType];
      if (target) {
        router.push(target);
        return;
      }
    }
    router.push('/');
  };

  return (
    <>
      <Head>
        <title>Connect Square - FindA.Sale</title>
      </Head>

      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900 px-4 py-12">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sm:p-8 text-center">
          {pageState === 'loading' && (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4" />
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Connecting your Square account
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">This will only take a moment…</p>
            </>
          )}

          {pageState === 'success' && result && (
            <>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <span className="text-2xl text-green-700 dark:text-green-400" aria-hidden="true">✓</span>
              </div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Square account connected
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {result.ownerType === 'VENDOR_BOOTH'
                  ? 'Your booth is now connected to Square.'
                  : `You're all set. Square is now connected to ${OWNER_LABEL[result.ownerType]}.`}
              </p>

              {!result.squareOnboarded && (
                <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-left">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    Your Square account setup isn't fully finished on Square's side yet. You may need to
                    complete a few more steps in Square before payouts can go through.
                  </p>
                </div>
              )}

              {result.payoutsFlaggedForReview && (
                <div className="mb-4 rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 p-3 text-left">
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    As a routine precaution, our team is taking a quick look at this account before payouts
                    begin. You'll be notified as soon as that's done. No action is needed from you.
                  </p>
                </div>
              )}

              {result.ownerType === 'VENDOR_BOOTH' ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                    You can close this tab and return to your booth to continue.
                  </p>
                  <button
                    onClick={() => router.push('/')}
                    className="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    Go to FindA.Sale
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">Redirecting you shortly…</p>
                  <button
                    onClick={handleContinue}
                    className="inline-flex justify-center py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition"
                  >
                    Continue
                  </button>
                </>
              )}
            </>
          )}

          {pageState === 'declined' && (
            <>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700">
                <span className="text-2xl text-gray-500 dark:text-gray-300" aria-hidden="true">×</span>
              </div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Square connection cancelled
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{declineMessage}</p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  onClick={() => router.back()}
                  className="inline-flex justify-center py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition"
                >
                  Go Back
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Go to FindA.Sale
                </button>
              </div>
            </>
          )}

          {pageState === 'error' && (
            <>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <span className="text-2xl text-red-600 dark:text-red-400" aria-hidden="true">!</span>
              </div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                We couldn't finish connecting Square
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{errorMessage}</p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  onClick={handleRetry}
                  className="inline-flex justify-center py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition"
                >
                  Try Again
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                >
                  Go to FindA.Sale
                </button>
              </div>
            </>
          )}

          {pageState === 'missing' && (
            <>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Nothing to connect here
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                This page is only used to finish connecting a Square account. If you were trying to connect
                Square, please start that from where you were setting up your payouts.
              </p>
              <button
                onClick={() => router.push('/')}
                className="inline-flex justify-center py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition"
              >
                Go to FindA.Sale
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
