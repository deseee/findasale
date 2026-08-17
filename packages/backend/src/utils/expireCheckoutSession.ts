import * as Sentry from '@sentry/node';
import { getStripe } from './stripe';

/**
 * expireCheckoutSession.ts
 *
 * Safe, evidence-first closure of a Stripe Checkout Session behind a Hold-to-Pay
 * invoice.
 *
 * Why this exists (P1, live Chrome QA 2026-08-17): releaseInvoice called
 * `stripe.checkout.sessions.expire(id)` inside a bare try/catch that only
 * `console.warn`ed on failure, and the call was observed failing with
 * "No such checkout session". The invoice was still flipped to CANCELLED and the
 * items handed back to RESERVED -- while the shopper's original Checkout link
 * stayed OPEN and PAYABLE. A shopper holding that link could pay for an item the
 * organizer had already released and potentially re-sold. Three separate defects
 * were behind it and all three are handled here:
 *
 *   1. Account routing. markSoldAndCreateInvoice / createCombinedInvoice create
 *      the Session on the CONNECTED account when the Direct-charges allowlist
 *      routes them there (`{ stripeAccount }` request option). A plain
 *      platform-scoped expire/retrieve for such a session returns
 *      "No such checkout session" -- Stripe is telling the truth, the object does
 *      not exist on the platform account. HoldInvoice has no persisted
 *      stripeAccountId column (a known, documented gap shared with
 *      POSPaymentLink), so callers pass the organizer's connectId when they have
 *      it and this helper transparently falls back to it on a resource_missing.
 *
 *   2. Terminal sessions are not failures. Stripe rejects `expire()` on a session
 *      that is already expired or complete. That is the desired end state, not an
 *      error, and it must not be logged as one (noise hides the real case).
 *
 *   3. A PAID session must never be silently discarded. Retrieving BEFORE
 *      expiring is what makes "is this already paid?" answerable, which
 *      releaseInvoice now uses to refuse to cancel an invoice the shopper has
 *      already paid for.
 *
 * Anything that leaves a session still OPEN after this runs is reported to Sentry:
 * that is a live payable link for an invoice we believe is dead, i.e. real money
 * exposure, and it must be visible rather than buried in a warn line.
 */

export type CheckoutSessionState =
  | 'OPEN'             // still payable
  | 'PAID'             // shopper already paid -- do NOT treat the invoice as dead
  | 'EXPIRED'          // terminal, not payable
  | 'COMPLETE_UNPAID'  // complete but unpaid (e.g. async payment pending)
  | 'NOT_FOUND'        // no such session on either account
  | 'UNKNOWN';         // Stripe unreachable / unexpected error

export interface ExpireCheckoutSessionResult {
  state: CheckoutSessionState;
  /** True only when we have positive evidence the session can no longer be paid. */
  closed: boolean;
  /** True when a payable session survived this call -- real exposure, always alerted. */
  stillPayable: boolean;
  error?: string;
}

const isResourceMissing = (err: any): boolean =>
  err?.code === 'resource_missing' ||
  err?.raw?.code === 'resource_missing' ||
  /no such checkout session/i.test(String(err?.message ?? ''));

/**
 * Retrieve a Checkout Session, transparently retrying on the connected account.
 * Returns null when the session exists on neither account.
 */
async function retrieveSession(
  sessionId: string,
  stripeAccount?: string | null
): Promise<{ session: any; usedAccount?: string } | null> {
  const stripe = getStripe();
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return { session };
  } catch (err: any) {
    if (!isResourceMissing(err) || !stripeAccount) throw err;
    // Direct-charge path: the Session lives on the connected account.
    const session = await stripe.checkout.sessions.retrieve(sessionId, undefined, {
      stripeAccount,
    });
    return { session, usedAccount: stripeAccount };
  }
}

/**
 * Close a Checkout Session so it can never be paid again.
 *
 * Never throws -- every caller here is on a settlement path where a Stripe outage
 * must not roll back local state. The return value carries what actually happened
 * so the caller can decide (releaseInvoice refuses to cancel a PAID invoice).
 *
 * @param sessionId       HoldInvoice.stripeSessionId
 * @param stripeAccount   organizer's Stripe connected-account id, when known
 * @param context         short label for logs/Sentry (e.g. "releaseInvoice invoice=abc")
 */
export async function expireCheckoutSessionSafely(
  sessionId: string,
  opts: { stripeAccount?: string | null; context: string }
): Promise<ExpireCheckoutSessionResult> {
  const { stripeAccount, context } = opts;
  const stripe = getStripe();

  let session: any;
  let usedAccount: string | undefined;
  try {
    const found = await retrieveSession(sessionId, stripeAccount);
    if (!found) {
      return { state: 'NOT_FOUND', closed: false, stillPayable: false };
    }
    session = found.session;
    usedAccount = found.usedAccount;
  } catch (err: any) {
    if (isResourceMissing(err)) {
      // Genuinely gone on both accounts. Nothing payable survives a session that
      // does not exist, so this is not exposure -- but it IS worth knowing about,
      // because it usually means the stored stripeSessionId is wrong.
      const msg = `[stripe-expire] ${context}: session ${sessionId} not found on platform${stripeAccount ? ' or connected account' : ''}.`;
      console.warn(msg);
      return { state: 'NOT_FOUND', closed: false, stillPayable: false, error: msg };
    }
    const msg = `[stripe-expire] ${context}: could not retrieve session ${sessionId}: ${err?.message ?? err}`;
    console.error(msg);
    return { state: 'UNKNOWN', closed: false, stillPayable: true, error: msg };
  }

  if (session.payment_status === 'paid') {
    return { state: 'PAID', closed: true, stillPayable: false };
  }
  if (session.status === 'expired') {
    return { state: 'EXPIRED', closed: true, stillPayable: false };
  }
  if (session.status === 'complete') {
    return { state: 'COMPLETE_UNPAID', closed: true, stillPayable: false };
  }

  // status === 'open' -- this is the one that must actually be expired.
  try {
    await stripe.checkout.sessions.expire(
      sessionId,
      undefined,
      usedAccount ? { stripeAccount: usedAccount } : undefined
    );
    return { state: 'EXPIRED', closed: true, stillPayable: false };
  } catch (err: any) {
    const msg = `[stripe-expire] ${context}: FAILED to expire OPEN checkout session ${sessionId} -- the payment link is STILL LIVE and payable for an invoice we just closed: ${err?.message ?? err}`;
    console.error(msg);
    try {
      Sentry.captureMessage(msg, 'error');
    } catch {
      // Sentry may not be initialized -- silently continue
    }
    return { state: 'OPEN', closed: false, stillPayable: true, error: msg };
  }
}
