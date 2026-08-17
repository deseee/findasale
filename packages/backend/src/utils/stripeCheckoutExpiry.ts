/**
 * Stripe Checkout Session `expires_at` bounds (P0 fix, 2026-08-16).
 *
 * Stripe rejects a Checkout Session whose `expires_at` is less than 30 minutes, or more
 * than 24 hours, after the moment the Session is created:
 *
 *   400 -- "The `expires_at` timestamp must be at least 30 minutes from Checkout
 *           Session creation."
 *
 * Every Hold-to-Pay invoice path sets the Checkout expiry from a business deadline that
 * has nothing to do with those bounds:
 *   - reservationController.markSoldAndCreateInvoice -- LOCKED DECISION #7, the invoice
 *     window is the hold timer's REMAINDER. The default shopper rank (INITIATE) gets a
 *     30-minute hold, so the remainder is ALWAYS under Stripe's floor, and even a
 *     just-extended hold ("Extend +30min" sets expiry to exactly now + 30m) lands
 *     seconds short of it. Every call 400'd.
 *   - posController.createCombinedInvoice -- QUICK mode is a flat 15-minute window,
 *     permanently under the floor; TRUST mode takes an organizer-supplied `expiresAt`
 *     which can just as easily be over the 24h ceiling.
 *
 * This helper clamps ONLY the value handed to Stripe. The business deadline itself
 * (HoldInvoice.expiresAt, ItemReservation.expiresAt) is deliberately NOT changed --
 * hold durations are a game-design decision, and invoiceExpiryJob still expires the
 * invoice and reclaims the items on the real business deadline.
 *
 * KNOWN, ACCEPTED DIVERGENCE (flag, not a silent tradeoff): when the floor bites, the
 * Stripe Checkout Session stays payable for up to ~31 minutes while HoldInvoice.expiresAt
 * may already have passed. A payment landing in that gap is handled by the SAME path that
 * already handles every other post-expiry payment -- invoiceExpiryJob's STRANDED-PAID
 * reconcile plus markHoldInvoicePaid's `status != PAID` guarded flip and sellItemUnits'
 * oversold-race guard. This widens a pre-existing window; it does not open a new one.
 * There is no shorter value Stripe will accept, so the only alternative would be raising
 * hold durations, which is explicitly out of scope here.
 */

/** Stripe's hard floor is 30 minutes; +1 minute of slack absorbs request latency. */
export const STRIPE_CHECKOUT_MIN_EXPIRY_MS = 31 * 60 * 1000;

/** Stripe's hard ceiling is 24 hours; -5 minutes of slack absorbs request latency. */
export const STRIPE_CHECKOUT_MAX_EXPIRY_MS = 23 * 60 * 60 * 1000 + 55 * 60 * 1000;

export type StripeCheckoutExpiry = {
  /** Unix seconds, safe to pass straight to `expires_at`. */
  expiresAtUnix: number;
  /** The clamped Date actually sent to Stripe (may differ from the business deadline). */
  effectiveExpiresAt: Date;
  /** Which bound bit, if any -- callers log this so the divergence is never invisible. */
  clampedTo: 'FLOOR' | 'CEILING' | null;
};

/**
 * Clamp a business deadline into Stripe's accepted `expires_at` window.
 *
 * @param desired  the business deadline (hold remainder, POS window, etc.)
 * @param now      injectable for tests; defaults to the current time
 */
export function stripeCheckoutExpiry(desired: Date, now: Date = new Date()): StripeCheckoutExpiry {
  const floor = new Date(now.getTime() + STRIPE_CHECKOUT_MIN_EXPIRY_MS);
  const ceiling = new Date(now.getTime() + STRIPE_CHECKOUT_MAX_EXPIRY_MS);

  let effectiveExpiresAt = desired;
  let clampedTo: 'FLOOR' | 'CEILING' | null = null;

  if (desired.getTime() < floor.getTime()) {
    effectiveExpiresAt = floor;
    clampedTo = 'FLOOR';
  } else if (desired.getTime() > ceiling.getTime()) {
    effectiveExpiresAt = ceiling;
    clampedTo = 'CEILING';
  }

  return {
    expiresAtUnix: Math.floor(effectiveExpiresAt.getTime() / 1000),
    effectiveExpiresAt,
    clampedTo,
  };
}
