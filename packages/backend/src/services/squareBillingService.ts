import { SquareError } from 'square';
import { getSquarePlatformClient } from '../utils/square';
import { toSquareMoney, buildSquareIdempotencyKey } from './squarePaymentService';

/**
 * Square Plan B Billing Service (2026-09-13) -- Cards API + FindA.Sale-owned scheduler for
 * PRO/TEAMS organizer subscriptions and Hunt Pass shopper subscriptions.
 *
 * WHY NOT SQUARE'S NATIVE SUBSCRIPTIONS API: confirmed via a live fetch of Square's own docs
 * (developer.squareup.com/docs/subscriptions-api/overview, 2026-09-09) -- "Catalog items sold
 * through subscriptions must be shipped to the customer" is stated as a blanket requirement
 * with no digital/service carve-out. FindA.Sale's PRO/TEAMS tiers and Hunt Pass are pure
 * service subscriptions with nothing to ship, so the native API does not fit. Full detail:
 * claude_docs/feature-notes/square-changeover-remaining-work-scoping-2026-09-09.md Section 2.
 *
 * DESIGN ("Plan B", architect-approved GO): tokenize a card client-side (Square Web Payments
 * SDK), store it as a Card-on-file against a Customer in FindA.Sale's OWN platform Square
 * account (NOT any organizer's connected account -- see utils/square.ts's
 * getSquarePlatformClient() header comment for the platform-vs-merchant client distinction),
 * then a daily cron (jobs/squareBillingChargeJob.ts) charges that stored card when the
 * relevant *CurrentPeriodEnd/*Expiry field says a renewal is due, following the same
 * dunning/grace conventions already established in tierGraceService.ts (7-day grace) rather
 * than inventing a new one.
 *
 * All money-moving functions here are used ONLY by:
 *   - billingController.ts's createSquareBillingSubscription / cancelSquareBillingSubscription
 *     (organizer PRO/TEAMS, authenticated + ownership-scoped to req.user.id's own Organizer row)
 *   - routes/streaks.ts's /subscribe-huntpass / /cancel-huntpass (shopper, scoped to req.user.id)
 *   - jobs/squareBillingChargeJob.ts (the scheduler -- no HTTP surface, DB-driven)
 * Never accepts an organizerId/userId/amount from request input for the actual charge amount
 * -- amounts are always looked up server-side from SQUARE_TIER_PRICE_CENTS / HUNT_PASS_PRICE_CENTS
 * keyed by a tier the server itself validated, never trusted from the client (no mass
 * assignment of price).
 */

export type BillableOrganizerTier = 'PRO' | 'TEAMS';

// ASSUMPTION (flagged to Patrick in the dispatch report, not silently decided): prices mirror
// pricing.tsx's live $29/$79 monthly figures (packages/frontend/pages/pricing.tsx lines ~58,
// ~80). Square Plan B v1 supports MONTHLY billing only -- an annual price for a Square-based
// flow is not defined anywhere in this codebase, and inventing one would violate the
// Schema/Package Read Gate's "don't guess a plausible value" rule, so annual sign-up via
// Square is deliberately not offered yet (existing Stripe annual subscribers, if any real
// ones exist, are unaffected -- this only gates NEW Square sign-ups).
export const SQUARE_TIER_PRICE_CENTS: Record<BillableOrganizerTier, number> = {
  PRO: 2900,
  TEAMS: 7900,
};

// Hunt Pass: $4.99/mo, confirmed via schema.prisma comment + claude_docs/STATE.md/decisions-log.md.
export const HUNT_PASS_PRICE_CENTS = 499;

export const BILLING_INTERVAL_DAYS = 30; // Square Plan B v1: monthly only, 30-day period.

// ASSUMPTION (flagged): 7-day free trial for a brand-new PRO/TEAMS Square subscription --
// card captured now, first charge deferred until the trial ends -- reusing the SAME 7-day
// number this codebase already uses for its downgrade grace period (tierGraceService.ts's
// triggerGracePeriod) so the trial length is at least consistent with an existing product
// convention rather than invented from nothing. No trial for Hunt Pass: it's a $4.99
// impulse add-on charged immediately at signup, matching how the original (now-dead) Stripe
// Checkout flow worked (no coupon/trial was ever wired for it).
export const ORGANIZER_TRIAL_DAYS = 7;

// ASSUMPTION (flagged): dunning policy for a failed renewal charge -- do NOT revoke access on
// the first failure. Retry every 2 days, up to 3 attempts, inside a 7-day hard grace ceiling
// (same 7-day figure as the trial/downgrade grace above, for one consistent "you have a week"
// story). Only once the grace deadline has passed with no successful charge does access
// actually get revoked (organizer -> SIMPLE tier; Hunt Pass -> deactivated).
export const DUNNING_GRACE_DAYS = 7;
export const DUNNING_RETRY_INTERVAL_DAYS = 2;

export function computeNextRetryAt(from: Date = new Date()): Date {
  const next = new Date(from.getTime());
  next.setDate(next.getDate() + DUNNING_RETRY_INTERVAL_DAYS);
  return next;
}

export function computeGraceEndsAt(from: Date = new Date()): Date {
  const end = new Date(from.getTime());
  end.setDate(end.getDate() + DUNNING_GRACE_DAYS);
  return end;
}

// Hacker-pass fix (2026-09-13): only a genuine SquareError (an actual decline/response
// from Square) is safe to surface to the end user verbatim -- any OTHER exception here
// (e.g. getPlatformBillingLocationId() throwing because SQUARE_PLATFORM_LOCATION_ID isn't
// set, a network error, a thrown config error) previously fell through to `err.message`
// and would leak internal configuration details ("SQUARE_PLATFORM_LOCATION_ID is not
// set...") straight into the 400 response body a shopper/organizer sees. Non-Square errors
// now always return a generic message; the real error is still logged server-side by every
// caller's console.warn/console.error, so nothing is lost for debugging.
export function extractDeclineMessage(err: unknown): string {
  if (err instanceof SquareError) {
    const first = (err as any).errors?.[0];
    return first?.detail || first?.code || 'Card declined';
  }
  return 'Card could not be processed. Please try again.';
}

function getPlatformBillingLocationId(): string {
  const locationId = process.env.SQUARE_PLATFORM_LOCATION_ID;
  if (!locationId) {
    throw new Error(
      "[squareBillingService] SQUARE_PLATFORM_LOCATION_ID is not set -- required to charge a " +
        "stored billing card against FindA.Sale's platform Square account. Same env var " +
        'squareVendorBoothCartService.ts already depends on; Patrick sets it once from the ' +
        'Square Developer Console (Locations page for the platform application).'
    );
  }
  return locationId;
}

/**
 * Create a Square Customer + Card-on-file in FindA.Sale's OWN platform Square account from a
 * client-tokenized sourceId. Mirrors squareVendorBoothCartService.ts's
 * createSquareSharedCardForCart -- same platform-client pattern, repurposed for recurring
 * billing (one persistent Customer+Card reused across every renewal, unlike the booth-cart's
 * one-shot-per-cart Customer object).
 */
export async function createPlatformBillingCard(params: {
  referenceId: string; // organizerId or userId -- ties the Square Customer back to our own record
  sourceId: string;
  note: string;
}): Promise<{ customerId: string; cardId: string }> {
  const client = getSquarePlatformClient();

  const customerResponse = await client.customers.create({
    referenceId: params.referenceId,
    note: params.note,
  });
  const customerId = (customerResponse as any)?.customer?.id;
  if (!customerId) {
    throw new Error('[squareBillingService] Square CreateCustomer (platform account) returned no customer id');
  }

  const cardResponse = await client.cards.create({
    idempotencyKey: buildSquareIdempotencyKey(['billing-card', params.referenceId, params.sourceId]),
    sourceId: params.sourceId,
    card: {
      customerId,
      referenceId: params.referenceId,
    } as any,
  } as any);
  const cardId = (cardResponse as any)?.card?.id;
  if (!cardId) {
    throw new Error('[squareBillingService] Square CreateCard (platform account) returned no card id');
  }

  return { customerId, cardId };
}

export interface ChargeStoredCardParams {
  customerId: string;
  cardId: string;
  amountCents: number;
  idempotencyParts: Array<string | number>;
  note: string;
  referenceId: string;
}
export interface ChargeStoredCardSuccess {
  ok: true;
  paymentId: string;
}
export interface ChargeStoredCardFailure {
  ok: false;
  message: string;
}
export type ChargeStoredCardResult = ChargeStoredCardSuccess | ChargeStoredCardFailure;

/**
 * Charges a previously-stored platform-account card-on-file. Single-step autocomplete:true
 * (unlike squarePosPaymentAdapter's delayed-capture two-step) -- there is no shopper present
 * to complete a second step for an unattended scheduler charge, and this mirrors the same
 * single-step mode squarePaymentService.ts's createSquareCharge already uses for the online
 * checkout surface (see that file's own comment for why autocomplete:true is the right
 * choice when nothing needs a manual-capture window).
 */
export async function chargeStoredCard(params: ChargeStoredCardParams): Promise<ChargeStoredCardResult> {
  const client = getSquarePlatformClient();
  try {
    const response = await client.payments.create({
      idempotencyKey: buildSquareIdempotencyKey(params.idempotencyParts),
      sourceId: params.cardId,
      customerId: params.customerId,
      amountMoney: toSquareMoney(params.amountCents),
      locationId: getPlatformBillingLocationId(),
      autocomplete: true,
      referenceId: params.referenceId.slice(0, 40),
      note: params.note,
    } as any);
    const payment = (response as any)?.payment;
    if (!payment?.id || (payment.status !== 'COMPLETED' && payment.status !== 'APPROVED')) {
      return { ok: false, message: 'Card declined' };
    }
    return { ok: true, paymentId: payment.id };
  } catch (err) {
    const message = extractDeclineMessage(err);
    // Log the RAW error server-side (full detail, e.g. a missing-env-var config error)
    // even though `message` returned to the caller is deliberately generic for anything
    // that isn't a genuine Square decline -- see extractDeclineMessage's own comment.
    console.warn(`[squareBillingService] chargeStoredCard decline/error (ref ${params.referenceId}):`, err);
    return { ok: false, message };
  }
}
