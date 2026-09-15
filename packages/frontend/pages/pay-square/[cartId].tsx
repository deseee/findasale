import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { SquarePaymentRequestForm } from '../../components/SquarePaymentRequestForm';
import api from '../../lib/api';

/**
 * pages/pay-square/[cartId].tsx -- vendor-booth-cart-checkout dispatch (2026-09-07).
 * Shopper-facing sibling of the register's Square QR/in-app rail (see
 * vendorBoothCartController.ts's "Square QR/in-app rail" section for the full backend
 * design). Square has no server-hosted session object the register can poll directly the
 * way Stripe's SetupIntent+clientSecret works, so the shopper's OWN device does the
 * tokenization here and relays the resulting one-time sourceId back to
 * POST .../square/token -- the register then picks it up via its own polling endpoint.
 *
 * URL shape: /pay-square/<cartId>?hub=<hubId>&amount=<dollars>&loc=<squareLocationId>
 * The register is the one that builds this URL (mirrors the existing Stripe QR rail's
 * `/pay/${clientSecret}?amount=...` pattern) -- squareLocationId is not sensitive (same
 * public-identifier class as a Stripe publishable key) so passing it in the URL is fine.
 *
 * SCOPE NOTE (this dispatch's own boundary, not silently glossed over): this page is fully
 * built and functional standalone, but pos.tsx's venue-mode cashier UI (the register side
 * that would GENERATE this URL, poll token-status, and call /square/authorize +
 * /capture) was NOT wired up this dispatch -- see this dispatch's handoff. The backend
 * endpoints (postBoothCartSquareToken, getBoothCartSquareTokenStatus,
 * authorizeBoothCartSquareLegs) are complete and independently testable via direct API
 * calls; only the register's own button/QR-display/poll wiring remains.
 */
export default function PaySquareCartPage() {
  const router = useRouter();
  const { cartId, hub, amount, loc } = router.query as {
    cartId?: string;
    hub?: string;
    amount?: string;
    loc?: string;
  };

  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const totalAmountCents = amount ? Math.round(parseFloat(amount) * 100) : 0;

  const handleSuccess = async (sourceId: string) => {
    if (!hub || !cartId) {
      setStatus('error');
      setErrorMessage('This payment link is missing required information. Please ask the cashier for a new QR code.');
      return;
    }
    setStatus('submitting');
    setErrorMessage('');
    try {
      await api.post(`/organizer/hubs/${hub}/cart/${cartId}/square/token`, { sourceId });
      setStatus('done');
    } catch (err: any) {
      console.error('[pay-square] Failed to submit card token:', err);
      setStatus('error');
      setErrorMessage(
        err?.response?.data?.error || err?.response?.data?.message || 'Could not submit your card. Please ask the cashier for a new QR code and try again.'
      );
    }
  };

  const handleError = (message: string) => {
    setStatus('error');
    setErrorMessage(message);
  };

  if (!cartId || !hub) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <p className="text-gray-600">Loading payment details…</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Pay with card | FindA.Sale</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Complete your purchase</h1>
          {totalAmountCents > 0 && (
            <p className="text-gray-600 mb-6">Total due: ${(totalAmountCents / 100).toFixed(2)}</p>
          )}

          {status === 'done' ? (
            <div className="p-4 border border-green-200 rounded-lg bg-green-50">
              <p className="text-sm text-green-700">
                Card submitted. Please look at the register. The cashier will finish your sale in a moment.
              </p>
            </div>
          ) : (
            <>
              <SquarePaymentRequestForm
                requestId={cartId}
                totalAmountCents={totalAmountCents}
                squareLocationId={loc ?? null}
                onSuccess={handleSuccess}
                onError={handleError}
                isProcessing={status === 'submitting'}
              />
              {status === 'error' && errorMessage && (
                <div className="mt-4 p-4 border border-red-200 rounded-lg bg-red-50">
                  <p className="text-sm text-red-700">{errorMessage}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
