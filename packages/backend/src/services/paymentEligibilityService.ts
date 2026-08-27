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
 *   3. Velocity/anomaly circuit breaker: >=5 distinct guest/buyer identities OR >=3 FAILED
 *      purchases against the same sale within a rolling 30-minute window trips
 *      Sale.paymentsHeldAt/paymentsHeldReason and blocks this request too (not just the next).
 *      Once paymentsHeldAt is set, every subsequent request short-circuits on a fast path with
 *      no query, until an admin manually clears it.
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
}): Promise<PaymentEligibilityResult> {
  const { prisma, sale, organizerStripeConnectId } = params;

  // Fix 1 — require live Stripe Connect onboarding. Reuses the exact response shape already
  // used elsewhere in stripeController.ts (createPaymentIntent's sellerAccountUnusable branch /
  // createCartCheckoutSession's connectErr branch) so the frontend's existing SELLER_PAYMENTS_
  // UNAVAILABLE handling covers this path too.
  if (!organizerStripeConnectId || organizerStripeConnectId.startsWith('acct_test_')) {
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

  // Fix 3b — velocity/anomaly circuit breaker.
  const recentPurchases = await prisma.purchase.findMany({
    where: { saleId: sale.id, createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } },
    select: { status: true, userId: true, buyerEmail: true, guestName: true },
  });

  const distinctIdentities = new Set(
    recentPurchases.map((p) => p.userId ?? p.buyerEmail ?? p.guestName ?? 'unknown')
  ).size;
  const failedCount = recentPurchases.filter((p) => p.status === 'FAILED').length;

  if (distinctIdentities >= 5 || failedCount >= 3) {
    const reason = `VELOCITY_ANOMALY: ${distinctIdentities} distinct guest identities + ${failedCount} FAILED purchases within 30min`;
    await prisma.sale.update({
      where: { id: sale.id },
      data: { paymentsHeldAt: new Date(), paymentsHeldReason: reason },
    });
    // The request that tripped the threshold is blocked too, not just subsequent ones.
    return { blocked: true, ...SALE_PAYMENTS_HELD_RESPONSE };
  }

  return { blocked: false };
}
