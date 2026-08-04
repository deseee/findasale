/**
 * /pay/[setupIntentClientSecretToken] — Venue/Multi-Vendor QR Rail, Shopper's Phone
 * (S1178 follow-up, Task 3, 2026-07-31)
 *
 * Patrick's exact ask: "the same as what's already there for QR, the customer scans
 * and pays on their own device and the manual card entry too... they're both already
 * built just reuse them." This page is the missing piece that wires those two
 * already-built pieces together for the venue/multi-vendor case:
 *
 *   - The register (pages/organizer/pos.tsx, venue mode's new QR button) calls the
 *     EXISTING createBoothCartQrSetupIntent endpoint (built for exactly this
 *     multi-vendor-split purpose — a SetupIntent-based, per-booth-cloned-PaymentMethod
 *     pattern, since a single Payment-Link PaymentIntent can't split across booths)
 *     and displays a QR encoding a URL to THIS page, carrying the SetupIntent's
 *     clientSecret.
 *   - The shopper scans it with their OWN phone camera and lands here.
 *   - This page reuses PosManualCard's Stripe Elements card form (in its new
 *     setupIntentClientSecret mode, added alongside this page) as the card-entry UI
 *     and calls stripe.confirmCardSetup on submit.
 *   - The register polls Stripe directly for the SetupIntent's status and, once it
 *     succeeds, calls authorizeBoothCartQrLegs (clones the PaymentMethod into every
 *     represented booth's account and confirms each leg) then the normal shared
 *     /capture endpoint — same as the QR rail always worked, just newly reachable
 *     from venue mode.
 *
 * Public, unauthenticated — no different from the existing public
 * /vendor-booth/[boothToken] page. The URL segment IS the Stripe SetupIntent client
 * secret: Stripe's own client secrets are explicitly designed to be handed to the
 * browser to complete a confirmation (the same trust boundary the non-venue
 * PosPaymentQr/Payment-Link flow relies on, and every other Stripe.js client-side
 * confirm call in this codebase) — holding it lets you complete THIS card setup and
 * nothing else; it grants no access to any FindA.Sale account or any other cart.
 */

import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import PosManualCard from '../../components/PosManualCard';

// Module-level singleton, same pattern as pos.tsx / vendor-booth/[boothToken].tsx --
// avoids re-creating the Stripe.js instance on every render.
let stripePromise: Promise<Stripe | null> | null = null;
const getStripePromise = () => {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
};

export default function VenueCartPayPage() {
  const router = useRouter();
  const { setupIntentClientSecretToken, amount, hub } = router.query;

  const clientSecret = typeof setupIntentClientSecretToken === 'string' ? setupIntentClientSecretToken : '';
  const displayAmount = typeof amount === 'string' ? parseFloat(amount) : 0;
  const hubName = typeof hub === 'string' && hub.trim() ? hub.trim() : null;

  const [buyerEmail, setBuyerEmail] = useState('');
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!router.isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-sage-600" />
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50 dark:bg-gray-900 p-4">
        <div className="max-w-sm w-full text-center">
          <p className="text-2xl mb-2">⚠️</p>
          <h1 className="text-lg font-bold text-warm-900 dark:text-warm-100 mb-2">This link isn't valid</h1>
          <p className="text-sm text-warm-600 dark:text-warm-400">
            Ask the cashier to generate a new QR code and scan it again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 flex items-center justify-center">
      <Head>
        <title>Complete Your Purchase | FindA.Sale</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="w-full max-w-sm">
        <div className="text-center mb-4">
          <h1 className="text-lg font-bold text-warm-900 dark:text-warm-100">Complete Your Purchase</h1>
          {hubName && (
            <p className="text-sm text-warm-600 dark:text-warm-400 mt-1">at {hubName}</p>
          )}
          <p className="text-xs text-warm-500 dark:text-warm-500 mt-1">
            Enter your card below. The cashier will finish your sale once it's confirmed here. You don't need to do anything else.
          </p>
        </div>

        {banner && (
          <div
            className={`mb-3 p-3 rounded-lg text-sm text-center ${
              banner.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
            }`}
          >
            {banner.message}
          </div>
        )}

        {/* Optional email, purely for the shopper's own reference -- not required to
            confirm the card, and no receipt is sent from this page (the itemized
            cart receipt is sent by the register's capture step, same as every other
            booth-cart checkout). */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-warm-700 dark:text-warm-300 mb-1">
            Email (optional)
          </label>
          <input
            type="email"
            value={buyerEmail}
            onChange={e => setBuyerEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full border border-warm-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-warm-900 dark:text-warm-100 focus:outline-none focus:ring-2 focus:ring-sage-500"
          />
        </div>

        <Elements stripe={getStripePromise()}>
          <PosManualCard
            cartTotal={displayAmount}
            cart={[]}
            selectedSaleId=""
            buyerEmail={buyerEmail}
            setupIntentClientSecret={clientSecret}
            onSuccess={(message) => setBanner({ type: 'success', message })}
            onError={(message) => setBanner({ type: 'error', message })}
          />
        </Elements>
      </div>
    </div>
  );
}
