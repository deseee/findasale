import { SquareError } from 'square';
import { prisma } from '../lib/prisma';
import { getSquareClientForMerchant, getSquarePlatformClient } from '../utils/square';
import { decryptToken, encryptToken } from '../utils/tokenCrypto';
import { buildSquareIdempotencyKey, toSquareMoney, resolveOrganizerSquareAccessToken } from './squarePaymentService';
import { refreshSquareAccessToken } from './squareConnectService'; // no circular import -- squareConnectService.ts does not import this file

/**
 * squareVendorBoothCartService.ts -- Square side of vendor-booth-cart-checkout
 * (2026-09-07, vendor-booth-cart-checkout dispatch, dedicated follow-up to Wave 1 of the
 * Square-replaces-Stripe migration). Mirrors vendorBoothCartController.ts's per-leg,
 * per-booth-own-account shape -- see that file's own header comment (ADR-020) for the
 * Stripe-side design this is a Square-flavored sibling of.
 *
 * ============================================================================
 * RESEARCHED ANSWER -- multi-merchant charge (collect shopper's card once, charge N
 * independently-connected booths in real time), the open question this dispatch was asked
 * to resolve, NOT guessed at:
 * ============================================================================
 * Square DOES support this via the Cards API's documented "Shared Card on File" mechanism
 * (developer.squareup.com/docs/cards-api/walkthrough-shared-card, fetched live 2026-09-07):
 *   1. Tokenize the shopper's card ONCE client-side via the Web Payments SDK (produces a
 *      single-use sourceId, same primitive squarePaymentService.ts/squarePosPaymentAdapter.ts
 *      already use).
 *   2. Create a Customer + Card in FindA.Sale's OWN platform Square developer account
 *      (getSquarePlatformClient(), NOT any connected merchant's token) using that sourceId --
 *      this "shared card" gets an id in the `ccof:...` namespace.
 *   3. For EACH connected booth, create (or reuse) a Customer in THAT booth's own connected
 *      account, then call CreatePayment scoped to that booth's own OAuth access token with
 *      `sourceId` = the shared card id and `customerId` = the booth-side customer. Square
 *      resolves which merchant a payment belongs to from the ACCESS TOKEN used for the call
 *      (same "the whole client is scoped to one merchant" model squarePaymentService.ts's
 *      header comment already documents for the non-booth-cart surface) -- so this is
 *      genuinely N separate real-time API calls, one per booth, each a live charge on that
 *      booth's own account, NOT one Stripe-style single-PaymentIntent-many-destinations call.
 *      That is functionally equivalent to what the shopper experiences (one card entry, N
 *      booths charged) even though the underlying mechanics differ from Stripe's
 *      docs.stripe.com/connect/direct-charges-multiple-accounts primitive.
 * Required OAuth scopes: `PAYMENTS_WRITE_SHARED_ONFILE` (added to squareConnectService.ts's
 * SQUARE_OAUTH_SCOPES by this dispatch) + `CUSTOMERS_WRITE` (also added). FLAGGED, NOT
 * silently assumed safe: Square's own "Cards on File Requirements" doc
 * (developer.squareup.com/docs/app-marketplace/requirements/cards-on-file) ties shared-card
 * functionality to Square's App Marketplace partner program in places -- whether
 * PAYMENTS_WRITE_SHARED_ONFILE requires a separate Square-side app review/approval before it
 * works in production (beyond the OAuth scope grant itself) was NOT confirmed this session.
 * This is the real-per-leg-split path (chosen over the single-merchant-then-settle fallback
 * the scoping doc offered) because it preserves the existing per-booth-is-its-own-merchant-
 * of-record model exactly -- see this dispatch's handoff for the full evidence trail.
 *
 * ============================================================================
 * RESEARCHED ANSWER -- hub-owner-share live Transfer equivalent (does Square let the
 * platform move money from one connected merchant's account to a DIFFERENT connected
 * merchant's account, mirroring Stripe's `transfers.create({ destination })`):
 * ============================================================================
 * NO live Transfer-between-merchants primitive exists (confirmed via Square's own Payouts
 * API docs: a Payout only ever moves a merchant's OWN balance to THEIR OWN linked bank
 * account). BUT this is now RESOLVED, not an open gap -- see ADR-123
 * (claude_docs/architecture/ADR-123-square-hub-owner-share-settlement-app-fee-allocations.md),
 * implemented same day as this comment was updated. Square's `app_fee_allocations` field
 * (Collect Application Fees guide, "Distribute fees to multiple parties" section) lets a
 * SINGLE CreatePayment call route part of the application fee to the platform's own
 * location AND part to a SEPARATE, independently-connected merchant's own location, up to
 * 3 parties total (seller + 2 allocation recipients) -- this is the real, current (2026)
 * Square equivalent of Stripe's Transfer, just at charge time instead of post-capture.
 * `authorizeSquareBoothCartLeg` below now branches to `appFeeAllocations` whenever a
 * nonzero hub-owner share applies (see `resolveSquareAppFeeParams`), so the hub owner's
 * cut lands in their own Square account atomically with the booth's own charge --
 * `transferHubOwnerShareForLeg` in vendorBoothCartController.ts no longer has anything to
 * do for a newly-authorized SQUARE leg (its SQUARE branch is now legacy/fallback-only, see
 * that function's own comment and ADR-123 §3.3 for the narrow bounded cases that can still
 * leave a leg unsettled: legs captured before this shipped, or a rare authorize-time
 * allocation failure).
 */

export class SquareBoothOnboardingIncompleteError extends Error {
  constructor(vendorBoothId: string) {
    super(
      `Square payments aren't available for this booth yet (vendorBoothId=${vendorBoothId}) -- ` +
        'either Square onboarding was never completed for this booth, or the stored OAuth token ' +
        'is missing/expired with no usable refresh token on file.'
    );
    this.name = 'SquareBoothOnboardingIncompleteError';
  }
}

const SQUARE_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000; // 5 minutes -- same skew squarePaymentService.ts uses

/**
 * Booth-scoped sibling of squarePaymentService.ts's resolveOrganizerSquareAccessToken --
 * VendorBooth is a DIFFERENT Prisma model from Organizer, so this cannot reuse that function
 * directly, but the decrypt/refresh/persist logic is intentionally identical (same skew, same
 * fail-closed posture, same "never fabricate a token" guarantee).
 */
export async function resolveVendorBoothSquareAccessToken(booth: {
  id: string;
  userId: string | null;
  squareAccountId: string | null;
  squareOnboarded: boolean;
}): Promise<string> {
  if (!booth.squareOnboarded || !booth.squareAccountId) {
    throw new SquareBoothOnboardingIncompleteError(booth.id);
  }

  const row = await prisma.vendorBooth.findUnique({
    where: { id: booth.id },
    select: {
      squareAccessTokenEncrypted: true,
      squareRefreshTokenEncrypted: true,
      squareTokenExpiresAt: true,
    },
  });

  if (!row?.squareAccessTokenEncrypted) {
    // P0 fix (2026-09-09, live-DB-confirmed against Artifact MI's real VendorBooth row):
    // a reuse-linked booth (startVendorBoothSquareOnboarding's reuse branch,
    // vendorBoothController.ts ~1185-1203) has squareOnboarded=true/squareAccountId set but
    // NEVER had a token copied onto it -- there was no second OAuth consent to copy a token
    // FROM. The only real token is the Organizer's own. Fall back to it here instead of
    // failing closed on a booth the user was told is "ready to take payments."
    if (booth.userId) {
      const organizer = await prisma.organizer.findFirst({
        where: { userId: booth.userId },
        select: { id: true, squareMerchantId: true, squareOnboarded: true },
      });
      // Safety check: only trust the fallback when the organizer's own Square identity is
      // EXACTLY the one this booth was reuse-linked to (the reuse branch sets
      // `squareAccountId: existing.squareMerchantId` at link time). A mismatch means real
      // data drift, not the expected reuse case -- never hand back a token for a payment
      // scoped to a different organizer than the one that actually owns this booth.
      if (
        organizer &&
        organizer.squareOnboarded &&
        organizer.squareMerchantId &&
        organizer.squareMerchantId === booth.squareAccountId
      ) {
        try {
          return await resolveOrganizerSquareAccessToken(organizer);
        } catch (err) {
          console.error(
            `[squareVendorBoothCartService] Organizer-token fallback failed for reuse-linked booth ${booth.id}:`,
            err
          );
          throw new SquareBoothOnboardingIncompleteError(booth.id);
        }
      }
    }
    throw new SquareBoothOnboardingIncompleteError(booth.id);
  }

  const expiresAt = row.squareTokenExpiresAt;
  const needsRefresh = !!expiresAt && expiresAt.getTime() <= Date.now() + SQUARE_TOKEN_REFRESH_SKEW_MS;

  if (!needsRefresh) {
    return decryptToken(row.squareAccessTokenEncrypted);
  }

  if (!row.squareRefreshTokenEncrypted) {
    console.error(
      `[squareVendorBoothCartService] Booth ${booth.id}'s Square access token is expired/expiring ` +
        'with no refresh token on file -- re-onboarding required.'
    );
    throw new SquareBoothOnboardingIncompleteError(booth.id);
  }

  try {
    const refreshToken = decryptToken(row.squareRefreshTokenEncrypted);
    const refreshed = await refreshSquareAccessToken(refreshToken);
    await prisma.vendorBooth.update({
      where: { id: booth.id },
      data: {
        squareAccessTokenEncrypted: encryptToken(refreshed.accessToken),
        ...(refreshed.refreshToken ? { squareRefreshTokenEncrypted: encryptToken(refreshed.refreshToken) } : {}),
        squareTokenExpiresAt: refreshed.expiresAt ? new Date(refreshed.expiresAt) : null,
      },
    });
    return refreshed.accessToken;
  } catch (err) {
    console.error(`[squareVendorBoothCartService] Failed to refresh Square access token for booth ${booth.id}:`, err);
    throw new SquareBoothOnboardingIncompleteError(booth.id);
  }
}

/**
 * Step 1+2 of the Shared Card on File walkthrough -- create a Customer + Card in
 * FindA.Sale's OWN platform Square account from the shopper's single-use sourceId. Called
 * ONCE per cart (mirrors createBoothCartQrSetupIntent's single platform-level Stripe
 * Customer+SetupIntent per cart). No idempotency/reuse check -- mirrors the Stripe path's
 * own simplicity (a fresh platform Customer object per cart there too); this is a small,
 * accepted amount of Customer-object clutter in the platform's own Square account, same
 * trade-off already made on the Stripe side.
 */
export async function createSquareSharedCardForCart(params: {
  cartTransactionId: string;
  sourceId: string;
}): Promise<{ platformCustomerId: string; sharedCardId: string }> {
  const client = getSquarePlatformClient();

  const customerResponse = await client.customers.create({
    referenceId: params.cartTransactionId,
    note: 'FindA.Sale booth-cart QR/in-app rail -- shared-card-on-file platform customer',
  });
  const platformCustomerId = (customerResponse as any)?.customer?.id;
  if (!platformCustomerId) {
    throw new Error('[squareVendorBoothCartService] Square CreateCustomer (platform account) returned no customer id');
  }

  const cardResponse = await client.cards.create({
    idempotencyKey: buildSquareIdempotencyKey(['sharedcard', params.cartTransactionId]),
    sourceId: params.sourceId,
    card: {
      customerId: platformCustomerId,
      referenceId: params.cartTransactionId,
    } as any,
  } as any);
  const sharedCardId = (cardResponse as any)?.card?.id;
  if (!sharedCardId) {
    throw new Error('[squareVendorBoothCartService] Square CreateCard (shared card) returned no card id');
  }

  return { platformCustomerId, sharedCardId };
}

export interface SquareBoothLegAuthorizeParams {
  boothAccessToken: string;
  sharedCardId: string;
  amountCents: number;
  appFeeCents: number;
  cartTransactionId: string;
  vendorBoothId: string;
  hubId: string;
  squareLocationId?: string | null;
  // ADR-123: portion of appFeeCents owed to the hub owner via app_fee_allocations, and
  // the hub owner's own connected Square location to allocate it to. Both undefined/0/
  // null on the common no-revenue-share leg (unchanged behavior from before this ADR).
  hubOwnerShareCents?: number;
  hubOwnerSquareLocationId?: string | null;
}

export interface SquareBoothLegAuthorizeSuccess {
  ok: true;
  paymentId: string;
  status: string;
  // ADR-123: true when this payment's app fee was split via appFeeAllocations (i.e. a
  // hub-owner share was allocated in this SAME CreatePayment call) -- the caller uses
  // this to set BoothCartLeg.hubOwnerShareSettledAt at authorize time instead of relying
  // on the (now Square-unreachable) post-capture transferHubOwnerShareForLeg path.
  hubOwnerShareSettledViaAllocation: boolean;
}
export interface SquareBoothLegAuthorizeFailure {
  ok: false;
  code: string;
  message: string;
}
export type SquareBoothLegAuthorizeResult = SquareBoothLegAuthorizeSuccess | SquareBoothLegAuthorizeFailure;

const DECLINE_MESSAGE = 'Your card was declined. Please check your card details or try a different card.';

/**
 * ADR-123 §5 item 2 (Architect's recommendation): a plain env var read, not a live
 * client.locations.list() call on every authorize -- the platform's own Square location
 * essentially never changes, so paying a live-API-call cost on every booth-cart leg
 * authorize would be waste for no real benefit. Patrick sets this once, read from the
 * Square Developer Console's own Locations page for FindA.Sale's platform application.
 */
function getPlatformSquareLocationId(): string {
  const locationId = process.env.SQUARE_PLATFORM_LOCATION_ID;
  if (!locationId) {
    throw new Error(
      '[squareVendorBoothCartService] SQUARE_PLATFORM_LOCATION_ID is not set. Patrick must look up ' +
        "FindA.Sale's platform Square location id (Developer Console -> Locations) and set it as an " +
        'env var on the Railway backend service before any hub-owner-revenue-share Square leg can ' +
        'authorize (ADR-123).'
    );
  }
  return locationId;
}

/**
 * ADR-123 §3.1: builds the appFeeMoney/appFeeAllocations branch of a booth-cart leg's
 * CreatePayment call. Single-recipient appFeeMoney is used when no hub-owner share
 * applies (hubOwnerShareCents undefined/0 -- the common no-split case, unchanged from
 * before this ADR). appFeeAllocations is used when a hub-owner share IS owed, splitting
 * the SAME total appFeeCents between the platform's own location and the hub owner's own
 * connected Square location, in the SAME CreatePayment call -- this is what makes the
 * payment land in the hub owner's account atomically with the booth's own charge (see
 * this file's header comment for the full researched rationale).
 *
 * Throws (rather than silently falling back to appFeeMoney and dropping the hub owner's
 * cut) if hubOwnerShareCents > 0 but no hubOwnerSquareLocationId was provided --
 * vendorBoothCartController.ts's computeLegFeeSplit SQUARE readiness gate (ADR-123 §3.2)
 * already blocks checkout before this function should ever be reached in that state, so
 * this is a programmer/config-error guard, not a normal runtime condition. Per ADR-123
 * §3.3 #2: an authorize-time allocation failure should fail the WHOLE leg, never silently
 * downgrade to a booth-only charge with an unpaid hub-owner accrual.
 */
function resolveSquareAppFeeParams(params: {
  appFeeCents: number;
  hubOwnerShareCents?: number;
  hubOwnerSquareLocationId?: string | null;
}):
  | { appFeeMoney: ReturnType<typeof toSquareMoney> }
  | { appFeeAllocations: Array<{ locationId: string; amountMoney: ReturnType<typeof toSquareMoney> }> } {
  const hubOwnerShareCents = params.hubOwnerShareCents ?? 0;
  if (hubOwnerShareCents <= 0) {
    return { appFeeMoney: toSquareMoney(params.appFeeCents) };
  }
  if (!params.hubOwnerSquareLocationId) {
    throw new Error(
      '[squareVendorBoothCartService] resolveSquareAppFeeParams: hubOwnerShareCents > 0 but no ' +
        "hubOwnerSquareLocationId was provided -- this should be unreachable (computeLegFeeSplit's " +
        'SQUARE readiness gate should have blocked checkout first). Failing the leg rather than ' +
        "silently dropping the hub owner's cut (ADR-123 \u00a73.3)."
    );
  }
  const platformFeeCents = params.appFeeCents - hubOwnerShareCents;
  return {
    appFeeAllocations: [
      { locationId: getPlatformSquareLocationId(), amountMoney: toSquareMoney(platformFeeCents) },
      { locationId: params.hubOwnerSquareLocationId, amountMoney: toSquareMoney(hubOwnerShareCents) },
    ],
  };
}

/**
 * Step 3+4 of the Shared Card on File walkthrough, per booth: create (or find) a Customer
 * in THIS booth's own connected account, then CreatePayment scoped to the booth's own
 * access token using the shared card as source_id. Delayed capture (autocomplete:false),
 * mirroring squarePosPaymentAdapter.ts's researched hold-window rationale -- lets
 * captureBoothCart's existing whole-cart-authorize-then-capture-all shape work unmodified.
 */
export async function authorizeSquareBoothCartLeg(
  params: SquareBoothLegAuthorizeParams
): Promise<SquareBoothLegAuthorizeResult> {
  const client = getSquareClientForMerchant(params.boothAccessToken);

  let boothCustomerId: string;
  try {
    const customerResponse = await client.customers.create({
      referenceId: params.cartTransactionId,
      note: `FindA.Sale booth-cart QR/in-app rail -- booth ${params.vendorBoothId}`,
    });
    boothCustomerId = (customerResponse as any)?.customer?.id;
    if (!boothCustomerId) {
      return { ok: false, code: 'NO_CUSTOMER_IN_RESPONSE', message: DECLINE_MESSAGE };
    }
  } catch (err) {
    if (err instanceof SquareError) {
      const first = (err as any).errors?.[0];
      console.warn(`[squareVendorBoothCartService] Square CreateCustomer (booth account) failed: ${first?.code || 'SQUARE_ERROR'} -- ${first?.detail || err.message}`);
      return { ok: false, code: first?.code || 'SQUARE_ERROR', message: DECLINE_MESSAGE };
    }
    throw err;
  }

  try {
    const paymentResponse = await client.payments.create({
      idempotencyKey: buildSquareIdempotencyKey(['boothleg', params.cartTransactionId, params.vendorBoothId]),
      sourceId: params.sharedCardId,
      customerId: boothCustomerId,
      amountMoney: toSquareMoney(params.amountCents),
      ...(params.appFeeCents > 0 ? resolveSquareAppFeeParams(params) : {}),
      ...(params.squareLocationId ? { locationId: params.squareLocationId } : {}),
      // Delayed capture -- see squarePosPaymentAdapter.ts's file-header for the researched
      // hold-window rationale this dispatch reuses unchanged (7-day card-not-present window).
      autocomplete: false,
      referenceId: params.cartTransactionId.slice(0, 40),
      note: `FindA.Sale booth cart leg -- hub ${params.hubId}, booth ${params.vendorBoothId}`,
    } as any);
    const payment = (paymentResponse as any)?.payment;
    if (!payment?.id) {
      return { ok: false, code: 'NO_PAYMENT_IN_RESPONSE', message: DECLINE_MESSAGE };
    }
    return {
      ok: true,
      paymentId: payment.id,
      status: payment.status ?? 'UNKNOWN',
      hubOwnerShareSettledViaAllocation: (params.hubOwnerShareCents ?? 0) > 0,
    };
  } catch (err) {
    if (err instanceof SquareError) {
      const first = (err as any).errors?.[0];
      console.warn(`[squareVendorBoothCartService] Square CreatePayment decline/error: ${first?.code || 'SQUARE_ERROR'} -- ${first?.detail || err.message}`);
      return { ok: false, code: first?.code || 'SQUARE_ERROR', message: DECLINE_MESSAGE };
    }
    throw err;
  }
}

/** Re-verify a leg's live status before capturing (mirrors captureBoothCart's Stripe re-check loop). */
export async function getSquareBoothCartLegStatus(boothAccessToken: string, paymentId: string): Promise<string | null> {
  const client = getSquareClientForMerchant(boothAccessToken);
  const response = await client.payments.get({ paymentId });
  return (response as any)?.payment?.status ?? null;
}

/** Completes (captures) a held/APPROVED Square booth-cart leg payment. */
export async function completeSquareBoothCartLeg(boothAccessToken: string, paymentId: string): Promise<string> {
  const client = getSquareClientForMerchant(boothAccessToken);
  const response = await client.payments.complete({ paymentId });
  return (response as any)?.payment?.status ?? 'UNKNOWN';
}

/** Cancels (voids) an uncaptured (APPROVED) Square booth-cart leg payment -- free, no charge ever landed. */
export async function cancelSquareBoothCartLeg(boothAccessToken: string, paymentId: string): Promise<void> {
  const client = getSquareClientForMerchant(boothAccessToken);
  await client.payments.cancel({ paymentId });
}

/**
 * Refunds a captured booth-cart leg's Square payment, scoped to the BOOTH's own access
 * token (not the organizer's -- a booth-cart leg's merchant of record is the booth's own
 * connected account, same Direct-charge-equivalent model the Stripe path already uses).
 *
 * ADR-123 §3.1/§5 item 4: for a leg whose payment used `appFeeAllocations` (a hub-owner
 * share was allocated at authorize time), this deliberately does NOT pass its own
 * `app_fee_allocations` on the refund. Square's Refund API is natively allocation-aware
 * and defaults to a PROPORTIONAL refund across the original payment's allocation set when
 * the refund omits its own -- Architect's explicit recommendation (not left undecided):
 * simpler than computing an exact custom split, matches what the Stripe path's
 * settleHubOwnerReversalForLeg effectively also does today (best-effort proportional
 * clawback via the owed/done cents watermark), and needs zero new state here. This
 * replaces the ENTIRE hubOwnerReversalOwedCents/hubOwnerReversalDoneCents race-closing
 * mechanism the Stripe path needs (§1) -- there is no analogous race to close for Square,
 * because there is no separate async Transfer step for a refund to race against; the
 * allocation-aware refund is a single atomic Square operation.
 */
export async function refundVendorBoothSquarePayment(
  boothAccessToken: string,
  paymentId: string,
  refundAmountCents: number,
  reason?: string
): Promise<void> {
  const client = getSquareClientForMerchant(boothAccessToken);
  // CONFIRMED 2026-09-07 (CI type error, this session): real method is `refundPayment`, not
  // `create` -- verified directly against the Square Node SDK's refunds/client/Client.ts source.
  // The `as any` cast is no longer needed now that the method name (and therefore the real
  // parameter types) matches.
  await client.refunds.refundPayment({
    idempotencyKey: buildSquareIdempotencyKey(['boothlegrefund', paymentId, String(refundAmountCents)]),
    paymentId,
    amountMoney: toSquareMoney(refundAmountCents),
    ...(reason ? { reason } : {}),
  });
}

/**
 * ============================================================================
 * BOOTH-RENT AUTO-PAY (2026-09-14, claude_docs/feature-notes/
 * booth-rent-autopay-square-design-2026-09-13.md) -- a second, simpler consumer of the
 * Shared Card on File pattern documented in this file's header comment. Booth-cart
 * checkout above charges N different BOOTHS' own connected accounts from one shopper
 * card; booth-rent auto-pay charges exactly ONE target account (the HUB OWNER's own
 * connected Square account) from one VENDOR's shared card, on a recurring cadence driven
 * by jobs/vendorBoothFeeBillingCron.ts (first attempt) and jobs/vendorBoothFeeRetryCron.ts
 * (dunning retries). No appFeeMoney/appFeeAllocations of any kind -- per the design doc's
 * §4, booth rent has no platform cut today, so this is a plain single-recipient charge,
 * simpler than authorizeSquareBoothCartLeg above (which must also implement ADR-123 fee
 * allocation). Kept in THIS file, not a new service module, because it is the same
 * "cross-account Square charge using a platform-account shared card" primitive already
 * documented and implemented immediately above -- one home for the pattern, two per-feature
 * thin call sites.
 * ============================================================================
 */

/**
 * Booth-fee twin of createSquareSharedCardForCart above -- creates the Customer + Card in
 * FindA.Sale's OWN platform Square account from the vendor's single-use sourceId, called
 * once per POST .../fee-billing/square-setup. Kept as its own function (rather than a
 * literal call to createSquareSharedCardForCart) so the idempotency key and referenceId
 * are booth-fee-scoped, not sharing key-space with the unrelated booth-cart-checkout
 * shared cards created above -- same client, same shape, different feature.
 */
export async function createSquareSharedCardForBoothFee(params: {
  vendorBoothId: string;
  sourceId: string;
}): Promise<{ platformCustomerId: string; sharedCardId: string }> {
  const client = getSquarePlatformClient();

  const customerResponse = await client.customers.create({
    referenceId: params.vendorBoothId,
    note: `FindA.Sale booth-rent auto-pay -- shared-card-on-file platform customer for booth ${params.vendorBoothId}`,
  });
  const platformCustomerId = (customerResponse as any)?.customer?.id;
  if (!platformCustomerId) {
    throw new Error(
      '[squareVendorBoothCartService] Square CreateCustomer (platform account, booth-fee) returned no customer id'
    );
  }

  const cardResponse = await client.cards.create({
    idempotencyKey: buildSquareIdempotencyKey(['boothfeecard', params.vendorBoothId, params.sourceId]),
    sourceId: params.sourceId,
    card: {
      customerId: platformCustomerId,
      referenceId: params.vendorBoothId,
    } as any,
  } as any);
  const sharedCardId = (cardResponse as any)?.card?.id;
  if (!sharedCardId) {
    throw new Error(
      '[squareVendorBoothCartService] Square CreateCard (shared card, booth-fee) returned no card id'
    );
  }

  return { platformCustomerId, sharedCardId };
}

export interface SquareBoothFeeChargeParams {
  /** The HUB OWNER's own resolved Square OAuth access token (resolveOrganizerSquareAccessToken). */
  hubOwnerAccessToken: string;
  hubOwnerSquareLocationId?: string | null;
  /** The vendor's platform-account shared card id (VendorBooth.vendorSquareCardId, "ccof:..."). */
  sharedCardId: string;
  amountCents: number;
  vendorBoothId: string;
  hubId: string;
  /** VendorBoothFeeCharge.id -- the SAME row across every retry attempt (no new row per retry). */
  chargeId: string;
  /** 1 on the first (cron) attempt, 2/3 on retry-cron re-attempts. Diagnostic/logging only as
   *  of the 2026-09-14 P1 fix below -- NOT part of the Square idempotency key (see
   *  chargeVendorBoothFeeOnHubOwnerAccount's idempotencyKey, which is now keyed on chargeId
   *  alone) so that a genuinely-ambiguous retry (the first attempt's response was lost, but the
   *  charge may have actually landed at Square) safely resolves to Square's ORIGINAL result
   *  instead of risking a second live charge. */
  attemptNumber: number;
}

export interface SquareBoothFeeChargeSuccess {
  ok: true;
  paymentId: string;
  status: string;
}
export interface SquareBoothFeeChargeFailure {
  ok: false;
  code: string;
  message: string;
}
export type SquareBoothFeeChargeResult = SquareBoothFeeChargeSuccess | SquareBoothFeeChargeFailure;

/**
 * The one Square call this design needs (§4/§6.2): create (or, per this implementation,
 * always freshly create -- same "small accepted amount of Customer clutter" trade-off
 * authorizeSquareBoothCartLeg above already makes per leg) a Customer in the HUB OWNER's
 * own connected account, then CreatePayment scoped to the hub owner's own access token
 * using the vendor's shared card as sourceId. Immediate capture (autocomplete omitted,
 * i.e. Square's own default of true) -- booth rent has no hold/authorize-then-capture
 * requirement the way a booth-cart leg does. No appFeeMoney -- no platform cut on booth
 * rent (resolved default, see the design doc's §9 item 2).
 */
export async function chargeVendorBoothFeeOnHubOwnerAccount(
  params: SquareBoothFeeChargeParams
): Promise<SquareBoothFeeChargeResult> {
  const client = getSquareClientForMerchant(params.hubOwnerAccessToken);

  let hubOwnerCustomerId: string;
  try {
    const customerResponse = await client.customers.create({
      referenceId: params.chargeId,
      note: `FindA.Sale booth rent auto-pay -- booth ${params.vendorBoothId}, hub ${params.hubId}`,
    });
    hubOwnerCustomerId = (customerResponse as any)?.customer?.id;
    if (!hubOwnerCustomerId) {
      return { ok: false, code: 'NO_CUSTOMER_IN_RESPONSE', message: DECLINE_MESSAGE };
    }
  } catch (err) {
    if (err instanceof SquareError) {
      const first = (err as any).errors?.[0];
      console.warn(
        `[squareVendorBoothCartService] Square CreateCustomer (hub owner account, booth-fee) failed: ${first?.code || 'SQUARE_ERROR'} -- ${first?.detail || err.message}`
      );
      return { ok: false, code: first?.code || 'SQUARE_ERROR', message: DECLINE_MESSAGE };
    }
    throw err;
  }

  try {
    const paymentResponse = await client.payments.create({
      // P1 fix (2026-09-14 security review): keyed on chargeId ALONE -- never attemptNumber.
      // Square's idempotency key exists precisely so a retried request with an ambiguous
      // outcome (timeout/connection-drop AFTER Square captured the charge but BEFORE this code
      // read the response) is safe to retry: reusing the SAME key means Square hands back the
      // ORIGINAL result instead of creating a brand-new charge. Varying the key per attempt (the
      // prior behavior) defeated that guarantee entirely.
      idempotencyKey: buildSquareIdempotencyKey(['boothfeecharge', params.chargeId]),
      sourceId: params.sharedCardId,
      customerId: hubOwnerCustomerId,
      amountMoney: toSquareMoney(params.amountCents),
      ...(params.hubOwnerSquareLocationId ? { locationId: params.hubOwnerSquareLocationId } : {}),
      autocomplete: true,
      referenceId: params.chargeId.slice(0, 40),
      note: `FindA.Sale booth rent -- hub ${params.hubId}, booth ${params.vendorBoothId}`,
    } as any);
    const payment = (paymentResponse as any)?.payment;
    if (!payment?.id) {
      return { ok: false, code: 'NO_PAYMENT_IN_RESPONSE', message: DECLINE_MESSAGE };
    }
    return { ok: true, paymentId: payment.id, status: payment.status ?? 'UNKNOWN' };
  } catch (err) {
    if (err instanceof SquareError) {
      const first = (err as any).errors?.[0];
      console.warn(
        `[squareVendorBoothCartService] Square CreatePayment decline/error (booth-fee): ${first?.code || 'SQUARE_ERROR'} -- ${first?.detail || err.message}`
      );
      return { ok: false, code: first?.code || 'SQUARE_ERROR', message: DECLINE_MESSAGE };
    }
    throw err;
  }
}

