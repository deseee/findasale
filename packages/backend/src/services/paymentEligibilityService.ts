import { prisma as prismaClient } from '../lib/prisma';

type PrismaClientLike = typeof prismaClient;

/**
 * Payment Eligibility Gate — Carding / Fraud Circuit Breaker
 * Incident: 2026-08-27 carding attack (S-incident-2026-08-27). A throwaway organizer
 * account ("Kenneth") that never completed real Stripe Connect onboarding created a sale
 * with junk items and ran 10 rapid guest checkouts using 10 different fake buyer identities
 * and 7 different card fingerprints (7 succeeded / $120, 3 failed) — 8 of the 10 charges hit
 * a sale that was already ENDED. Root cause: `createPaymentIntent` only ever checked
 * `item.status`, never `sale.status`, and did not reject an organizer whose stripeConnectId
 * was set to a non-live (`acct_test_`-prefixed) placeholder value.
 *
 * This module is the SINGLE shared preflight gate for every buyer-facing payment-creation
 * endpoint (createPaymentIntent, createCartCheckoutSession — NOT the subscription-upgrade
 * createCheckoutSession, which has no sale/item/Connect-account relationship at all, and NOT
 * POS/terminal/vendor-booth-Direct paths, which have a different trust model). Call this
 * BEFORE any `stripe().paymentIntents.create()` / `stripe().checkout.sessions.create()` call,
 * short-circuiting on the first check that blocks.
 *
 * Patrick's explicit direction: the fix is "require real Stripe Connect onboarding before any
 * charge," NOT an artificial time-based cooldown. Onboarding is Stripe's own KYC gate.
 *
 * Checks, in cheapest/most-certain-first order:
 *   1. Live Stripe Connect onboarding required (no null/missing/acct_test_ organizer account).
 *   2. Sale must be PUBLISHED (blocks charges against DRAFT/ENDED sales).
 *   3. Velocity/anomaly circuit breaker: a DECLINE-RATE spike (>=3 FAILED purchases AND a
 *      >=30% failure rate) against the same sale within a rolling 30-minute window trips
 *      Sale.paymentsHeldAt/paymentsHeldReason and blocks this request too (not just the next).
 *      Once paymentsHeldAt is set, every subsequent request short-circuits on a fast path with
 *      no query, until an admin manually clears it.
 *      Deliberately NOT keyed on raw distinct-buyer count: once Fix 1 already requires the
 *      seller to be Stripe-Connect-verified, a busy sale with many successful DISTINCT buyers
 *      is a good thing, not a fraud signal. Card testing shows up as a burst of DECLINES, not
 *      a burst of successful buyers — a real busy sale can see 5+, 20+, 100+ genuine buyers in
 *      30 minutes and none of it should ever hold payments. (Patrick correction, 2026-08-27:
 *      the first version of this check keyed on distinct identities alone and would have held
 *      any sufficiently popular legitimate sale.)
 */

export interface SaleEligibilityInput {
  id: string;
  status: string;
  paymentsHeldAt: Date | null;
}

export interface PaymentEligibilityBlockedResult {
  blocked: true;
  status: number;
  body: { message: string; code: string };
}

export interface PaymentEligibilityAllowedResult {
  blocked: false;
}

export type PaymentEligibilityResult = PaymentEligibilityBlockedResult | PaymentEligibilityAllowedResult;

const SALE_PAYMENTS_HELD_RESPONSE = {
  status: 409 as const,
  body: {
    message: 'This sale is temporarily unavailable for purchases. Please try again later or contact support.',
    code: 'SALE_PAYMENTS_HELD',
  },
};

/**
 * Runs the full payment-eligibility preflight for a single sale. Safe to call once per
 * request even for multi-item carts (all items in a cart checkout belong to one sale — see
 * createCartCheckoutSession's own single-sale validation upstream of this call).
 */
export async function assertSaleCanAcceptPayment(params: {
  prisma: PrismaClientLike;
  sale: SaleEligibilityInput;
  organizerStripeConnectId: string | null | undefined;
  // 2026-09-03 fix (post-mortem on the Aug 27 fix itself): a live acct_ id only proves Connect
  // onboarding STARTED (Stripe issues the id immediately, before KYC/verification finishes),
  // not that it COMPLETED. Organizer.stripeOnboarded is the field actually set true by the
  // account.updated webhook once charges_enabled && payouts_enabled (schema.prisma: "P2-1: Set
  // true when account.updated webhook confirms charges_enabled && payouts_enabled"). Required
  // alongside organizerStripeConnectId, not instead of it.
  organizerStripeOnboarded: boolean | null | undefined;
}): Promise<PaymentEligibilityResult> {
  const { prisma, sale, organizerStripeConnectId, organizerStripeOnboarded } = params;

  // Fix 1 — require live Stripe Connect onboarding. Reuses the exact response shape already
  // used elsewhere in stripeController.ts (createPaymentIntent's sellerAccountUnusable branch /
  // createCartCheckoutSession's connectErr branch) so the frontend's existing SELLER_PAYMENTS_
  // UNAVAILABLE handling covers this path too.
  //
  // INCIDENT 2026-09-03: this check originally stopped at "does a live account id exist," which
  // is satisfied the instant Connect onboarding STARTS, not once it COMPLETES. A same-day
  // signup (Organizer stripeConnectId=acct_1UBhOGPyTEk2SFYk, real/non-test) took 2 real PAID
  // charges while stripeOnboarded/stripeConnectEnabled were both still false. Added the
  // stripeOnboarded check below to close that gap — see findasale-hacker re-audit this session.
  if (
    !organizerStripeConnectId ||
    organizerStripeConnectId.startsWith('acct_test_') ||
    organizerStripeOnboarded !== true
  ) {
    return {
      blocked: true,
      status: 409,
      body: {
        message: "This seller isn't set up to accept online payments yet. Please contact the organizer to arrange your purchase.",
        code: 'SELLER_PAYMENTS_UNAVAILABLE',
      },
    };
  }

  // Fix 2 — sale must be PUBLISHED. Closes the gap that let 8 of 10 carding charges hit an
  // already-ENDED sale (only item.status was checked before this fix).
  if (sale.status !== 'PUBLISHED') {
    return {
      blocked: true,
      status: 409,
      body: { message: 'This sale is no longer active.', code: 'SALE_NOT_ACTIVE' },
    };
  }

  // Fix 3a — already held: fast path, no query needed.
  if (sale.paymentsHeldAt) {
    return { blocked: true, ...SALE_PAYMENTS_HELD_RESPONSE };
  }

  // Fix 3b — velocity/anomaly circuit breaker, keyed on DECLINE RATE, not buyer volume.
  // 2026-09-03 note (findasale-hacker re-audit): this FAILED-rate check is blind to an abuse
  // pattern that mostly succeeds/sits PENDING/gets refunded instead of declining -- exactly
  // today's incident (2 PAID, 1 REFUNDED, 3 PENDING, zero FAILED -- failureRate stayed 0%,
  // never neared the 3/30% threshold below). Decision: rather than add a second count-based
  // threshold here (which would repeat the exact buyer-identity-volume mistake this file's own
  // top comment already warns against -- a busy sale can legitimately see PENDING/refund
  // volume too), the fix is in checkoutGuard.ts's recordConfirmedSignal(): ANY single CONFIRMED
  // FraudSignal (of any type, on any sale) now auto-sets Sale.paymentsHeldAt immediately,
  // independent of this FAILED-count math entirely. That is a stronger, earlier, high-precision
  // signal (100 confidenceScore, identity-grade match) than a volume/rate threshold could ever
  // be, and it would have held this sale at 21:21:49 instead of leaving it open until a human
  // manually intervened ~50 minutes later. This FAILED-rate check remains as a second,
  // independent backstop for the different failure shape (card-testing via random/stolen
  // numbers, which the 2026-08-27 incident actually was) that recordConfirmedSignal's
  // identity-match checks don't cover on their own.
  const recentPurchases = await prisma.purchase.findMany({
    where: { saleId: sale.id, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
    select: { status: true },
  });

  const totalAttempts = recentPurchases.length;
  const failedCount = recentPurchases.filter((p) => p.status === 'FAILED').length;
  const failureRate = totalAttempts > 0 ? failedCount / totalAttempts : 0;

  // Require BOTH a minimum absolute count (so a single unlucky real decline never trips this)
  // AND a meaningful rate (so a high-volume sale with a handful of ordinary declines mixed
  // into many successes never trips this either). 3 FAILED / 30%+ matches the real incident
  // (3 FAILED out of 10 attempts = 30%) without penalizing popularity.
  if (failedCount >= 3 && failureRate >= 0.3) {
    const reason = `VELOCITY_ANOMALY: ${failedCount} FAILED out of ${totalAttempts} purchase attempts (${Math.round(failureRate * 100)}%) within 30min`;
    await prisma.sale.update({
      where: { id: sale.id },
      data: { paymentsHeldAt: new Date(), paymentsHeldReason: reason },
    });
    // The request that tripped the threshold is blocked too, not just subsequent ones.
    return { blocked: true, ...SALE_PAYMENTS_HELD_RESPONSE };
  }

  return { blocked: false };
}
