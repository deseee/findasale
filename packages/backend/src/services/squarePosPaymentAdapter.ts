import { SquareError } from 'square';
import * as Sentry from '@sentry/node';
import { getSquareClientForMerchant } from '../utils/square';
import { prisma } from '../lib/prisma';
import {
  resolveOrganizerSquareAccessToken,
  SquareOnboardingIncompleteError,
  toSquareMoney,
  buildSquareIdempotencyKey,
} from '../services/squarePaymentService';

/**
 * Square POS Payment Adapter -- Square migration Wave 1 #3, Phone-based POS (2026-09-07).
 *
 * KEY DESIGN DIFFERENCE FROM STRIPE: Square has no pre-create-then-confirm primitive the
 * way Stripe's PaymentIntent+clientSecret works -- CreatePayment REQUIRES a real sourceId
 * (a card token produced by the shopper's own device via the Web Payments SDK), so there
 * is nothing to create at REQUEST time. The actual Square Payment is created once the
 * shopper has tokenized their card -- i.e. at what was already the "confirm" step of the
 * existing flow (posPaymentController.confirmPaymentRequest), not a new endpoint.
 *
 * DELAYED CAPTURE (autocomplete:false) -- RESEARCHED, NOT ASSUMED: CreatePayment is called
 * with autocomplete:false (authorize only, Payment.status APPROVED), immediately followed
 * by CompletePayment (capture) in the same request/response cycle -- mirroring Stripe's
 * automatic-capture confirmCardPayment (authorize+capture together from the caller's point
 * of view). WHY delayed capture instead of autocomplete:true (the single-step mode
 * squarePaymentService.ts's createSquareCharge uses for the online checkout surface): if
 * CompletePayment fails right after a successful CreatePayment (network blip, process
 * restart), autocomplete:false leaves the payment safely held in APPROVED status rather
 * than in an ambiguous or lost state. Square's own default authorization-hold window for a
 * card-not-present (Web Payments SDK) payment was confirmed via TWO independent live
 * Square sources read 2026-09-07: (1) developer.squareup.com/docs/payments-api/take-payments/
 * card-payments/delayed-capture ("7 days for online (card not present) payments"), and (2)
 * the Square Node SDK's own Payment.delayDuration field doc comment (default "P7D" for
 * card-not-present vs "PT36H"/36h for card-present). That is the SAME order of magnitude as
 * Stripe's own up-to-7-day manual-capture window this dispatch was asked to compare
 * against -- comfortably long enough to cover the gap between an organizer sending a
 * payment request and a shopper completing card entry (this surface's own
 * expiresInSeconds defaults to 15 minutes and is never more than a few hours in practice),
 * and long enough to safely retry a failed CompletePayment well after the original
 * request/response cycle if needed. delay_action is left at Square's own default (CANCEL)
 * -- if nobody ever completes or cancels an APPROVED payment, Square auto-releases the
 * hold after 7 days rather than auto-capturing money nobody confirmed, matching this
 * surface's existing "never silently take payment" posture.
 *
 * KNOWN GAP (flagged, not silently resolved): if CreatePayment succeeds but the immediate
 * CompletePayment call fails, this adapter returns `captured:false` with the Square
 * paymentId already resolved -- the controller persists that id and leaves the
 * POSPaymentRequest at ACCEPTED (not PAID), and the shopper is told payment is still
 * processing rather than told it succeeded. No automated retry/reconciliation JOB was
 * built this session (out of the ~1-1.5 session effort budget) -- a held authorization in
 * this state needs either a manual retry (re-running confirmPaymentRequest, which will
 * detect the existing squarePaymentId via `existingSquarePaymentId` and call
 * CompletePayment again rather than re-authorizing) or, failing that, will auto-release
 * after Square's 7-day default. Recommended follow-up: a reconciliation cron mirroring
 * deadInvoicePaidSweepJob.ts's shape, sweeping ACCEPTED POSPaymentRequest rows with a
 * non-null squarePaymentId older than some threshold.
 *
 * ACCESS TOKEN: reuses services/squarePaymentService.ts's resolveOrganizerSquareAccessToken
 * (the checkout dispatch's shared integration seam, Wave 1 #1) rather than duplicating it.
 * RESOLVED (2026-09-07, Wave 0.5): that function now reads/decrypts/refreshes a real
 * persisted per-organizer Square OAuth token (Organizer.squareAccessTokenEncrypted etc.)
 * instead of always throwing -- this adapter's preflight function below still converts a
 * SquareOnboardingIncompleteError into the same clean 400 it always did, but that now only
 * fires for organizers who genuinely haven't completed Square onboarding or whose token has
 * expired with no refresh token on file, not unconditionally for everyone.
 */

export interface PreflightOk {
  ok: true;
  accessToken: string;
  // Self-heal backfill (2026-09-13, "organizer not finished connecting Square" bug fix):
  // the resolved, live-verified ACTIVE Square location id for this organizer -- always
  // present when ok:true, whether it came from the DB cache or was just backfilled inside
  // this function. Callers that build a createAndCapturePayment() call in the SAME request
  // MUST use this field (not their own pre-preflight organizer.squareLocationId local),
  // since a locationId backfilled inside preflightAccountStatus is not otherwise visible to
  // a caller that already captured organizer fields into local variables before calling it.
  squareLocationId: string;
}
export interface PreflightFail {
  ok: false;
  status: number;
  message: string;
}
export type PreflightResult = PreflightOk | PreflightFail;

export interface OrganizerSquareFields {
  id: string;
  squareOnboarded: boolean;
  squareMerchantId: string | null;
  squareLocationId: string | null;
}

/**
 * Live capability preflight, mirroring stripePosPaymentAdapter's own rigor: never trusts
 * the DB-cached squareOnboarded flag alone once a real access token exists -- live-checks
 * the Square location's own status before authorizing a charge against it.
 *
 * SELF-HEALING squareLocationId BACKFILL (2026-09-13, "organizer not finished connecting
 * Square" bug fix): squareOnboarded/squareMerchantId are set together at OAuth-connect
 * time (handleSquareConnectCallback, squareConnectController.ts) and mean "this organizer
 * completed the Square OAuth handshake" -- a real, permanent fact that never needs
 * correcting. squareLocationId is a SEPARATE field, captured from that SAME callback's
 * one-shot getSquareAccountStatus() call -- if that call returned no location at that
 * moment (e.g. the organizer's Square account had no location created yet) or the
 * organizer connected before this field's capture logic existed, squareOnboarded/
 * squareMerchantId are correctly true forever while squareLocationId is left permanently
 * null, with nothing to ever re-check or backfill it. That mismatch is exactly what
 * produced "organizer shows as connected everywhere else but POS payments say not
 * connected" -- so, same philosophy as resolveOrganizerSquareAccessToken's own
 * live-token-refresh rigor, a null/stale squareLocationId here is treated as a
 * live-checkable, self-healable gap, not a "never connected" verdict. Only a genuinely
 * false squareOnboarded or null squareMerchantId (the two facts that really can never be
 * recovered without the organizer re-running OAuth) short-circuit immediately below.
 */
export async function preflightAccountStatus(organizer: OrganizerSquareFields): Promise<PreflightResult> {
  if (!organizer.squareOnboarded || !organizer.squareMerchantId) {
    return {
      ok: false,
      status: 400,
      message: "This organizer's Square account is not fully connected. Please complete Square onboarding.",
    };
  }

  let accessToken: string;
  try {
    accessToken = await resolveOrganizerSquareAccessToken({
      id: organizer.id,
      squareMerchantId: organizer.squareMerchantId,
      squareOnboarded: organizer.squareOnboarded,
    });
  } catch (err) {
    if (err instanceof SquareOnboardingIncompleteError) {
      return {
        ok: false,
        status: 400,
        message: "This organizer's Square account is not fully connected. Please complete Square onboarding.",
      };
    }
    console.error('[squarePosPaymentAdapter] resolveOrganizerSquareAccessToken failed:', err);
    return { ok: false, status: 502, message: 'Could not verify the organizer Square account. Please try again.' };
  }

  let locationId = organizer.squareLocationId;
  let backfillAttempted = false;

  if (!locationId) {
    backfillAttempted = true;
    locationId = await backfillSquareLocationId(organizer.id, accessToken);
    if (!locationId) {
      return {
        ok: false,
        status: 400,
        message: "This organizer's Square account is not fully connected. Please complete Square onboarding.",
      };
    }
  }

  try {
    const client = getSquareClientForMerchant(accessToken);
    const response = await client.locations.get({ locationId });
    const location = (response as any)?.location;
    if (location?.status !== 'ACTIVE') {
      return {
        ok: false,
        status: 400,
        message: "This organizer's Square account cannot currently accept charges. Please check Square onboarding status.",
      };
    }
  } catch (err) {
    // Defensive: the DB-stored locationId itself may be stale/invalid against Square (e.g.
    // deleted/merged on Square's side after we cached it). Only worth a fresh lookup if we
    // have not already just backfilled this call -- avoids a pointless double list() call.
    if (!backfillAttempted) {
      const freshLocationId = await backfillSquareLocationId(organizer.id, accessToken);
      if (freshLocationId) {
        try {
          const client = getSquareClientForMerchant(accessToken);
          const retryResponse = await client.locations.get({ locationId: freshLocationId });
          const retryLocation = (retryResponse as any)?.location;
          if (retryLocation?.status === 'ACTIVE') {
            return { ok: true, accessToken, squareLocationId: freshLocationId };
          }
        } catch (retryErr) {
          console.error('[squarePosPaymentAdapter] Square locations.get retry after backfill failed:', retryErr);
        }
      }
    }
    console.error('[squarePosPaymentAdapter] Square locations.get preflight failed:', err);
    return {
      ok: false,
      status: 502,
      message: "Could not verify the organizer's Square account status. Please try again.",
    };
  }

  return { ok: true, accessToken, squareLocationId: locationId };
}

/**
 * Lists the merchant's real Square locations (client.locations.list() -- Square Node SDK
 * v45.1.0, method/response shape verified directly against the installed SDK's own
 * Client.d.ts and ListLocationsResponse/Location type declarations in
 * node_modules/.pnpm/square@45.1.0) and picks an ACTIVE one to backfill
 * Organizer.squareLocationId with. schema.prisma's own comment on that column ("Square
 * requires a location, not just a merchant id") assumes exactly one location per
 * organizer; if Square returns more than one ACTIVE location, the first is used and a
 * Sentry warning is fired so Patrick can review whether that organizer needs real
 * multi-location support later. Returns null (never throws) when Square has zero ACTIVE
 * locations or the API call itself fails -- callers treat that the same as before this
 * fix: "still not fully connected."
 */
async function backfillSquareLocationId(organizerId: string, accessToken: string): Promise<string | null> {
  try {
    const client = getSquareClientForMerchant(accessToken);
    const response = await client.locations.list();
    const locations = (response as any)?.locations ?? [];
    const activeLocations = locations.filter((loc: any) => loc?.status === 'ACTIVE' && loc?.id);

    if (activeLocations.length === 0) {
      console.warn(
        `[squarePosPaymentAdapter] backfillSquareLocationId: organizer ${organizerId} has no ACTIVE Square location.`
      );
      return null;
    }

    if (activeLocations.length > 1) {
      const msg =
        `[squarePosPaymentAdapter] Organizer ${organizerId} has ${activeLocations.length} ACTIVE Square ` +
        `locations -- Organizer.squareLocationId assumes exactly one per organizer (see schema.prisma). ` +
        `Backfilling with the first (${activeLocations[0].id}); the rest are ignored.`;
      console.warn(msg);
      try {
        Sentry.captureMessage(msg, 'warning');
      } catch {
        // Sentry may not be initialized -- never let alerting break a payment preflight
      }
    }

    const locationId = activeLocations[0].id as string;
    await prisma.organizer.update({
      where: { id: organizerId },
      data: { squareLocationId: locationId },
    });
    console.warn(`[squarePosPaymentAdapter] Backfilled Organizer ${organizerId}.squareLocationId = ${locationId} (was null).`);
    return locationId;
  } catch (err) {
    console.error('[squarePosPaymentAdapter] backfillSquareLocationId failed:', err);
    return null;
  }
}

/**
 * Best-effort wrapper around the same self-heal for callers that only have the
 * organizer's cached identity fields (not an already-resolved access token) and must
 * never fail their own request over this -- e.g. getPosContext (posController.ts) and
 * initiateSquareOrganizerOnboarding (squareConnectController.ts), both of which display
 * Square-connection status to the organizer well BEFORE any payment is ever attempted, so
 * preflightAccountStatus's own backfill (above) would otherwise never get a chance to run
 * for an organizer who only ever uses those surfaces first. Returns null on ANY failure
 * (never throws) so callers can fall back to their existing behavior unchanged.
 */
export async function resolveAndBackfillSquareLocationId(organizer: {
  id: string;
  squareMerchantId: string | null;
  squareOnboarded: boolean;
}): Promise<string | null> {
  if (!organizer.squareOnboarded || !organizer.squareMerchantId) return null;
  try {
    const accessToken = await resolveOrganizerSquareAccessToken({
      id: organizer.id,
      squareMerchantId: organizer.squareMerchantId,
      squareOnboarded: organizer.squareOnboarded,
    });
    return await backfillSquareLocationId(organizer.id, accessToken);
  } catch (err) {
    console.error('[squarePosPaymentAdapter] resolveAndBackfillSquareLocationId failed:', err);
    return null;
  }
}

export interface CreateAndCapturePaymentParams {
  organizer: OrganizerSquareFields;
  accessToken: string;
  sourceId: string;
  amountCents: number;
  appFeeCents: number;
  posRequestId: string;
  existingSquarePaymentId?: string | null;
}

export interface CreateAndCapturePaymentSuccess {
  ok: true;
  paymentId: string;
  captured: true;
}
export interface CreateAndCapturePaymentHeld {
  ok: true;
  paymentId: string;
  captured: false;
  delayedUntil?: string;
}
export interface CreateAndCapturePaymentFailure {
  ok: false;
  status: number;
  message: string;
}
export type CreateAndCapturePaymentResult =
  | CreateAndCapturePaymentSuccess
  | CreateAndCapturePaymentHeld
  | CreateAndCapturePaymentFailure;

const DECLINE_MESSAGE = 'Your card was declined. Please check your card details or try a different card.';

/**
 * The Square-specific "payment creation" + "retrieve/confirm" + "status check" call sites
 * all in one adapter function, since Square's create-and-capture is inherently a two-call
 * sequence rather than the three separately-timed events Stripe's create/retrieve pair
 * maps to. Retry-safe: if `existingSquarePaymentId` is passed (a prior attempt already got
 * as far as CreatePayment), this re-fetches that exact Payment instead of creating a new
 * one, then completes it if it is still APPROVED -- so a shopper/client retry after a
 * dropped response can never double-authorize a card. Also protected by Square's own
 * idempotency key (buildSquareIdempotencyKey is a stable hash of posRequestId), a second
 * layer of retry-safety independent of the existingSquarePaymentId short-circuit.
 */
export async function createAndCapturePayment(
  params: CreateAndCapturePaymentParams
): Promise<CreateAndCapturePaymentResult> {
  const client = getSquareClientForMerchant(params.accessToken);

  let paymentId: string;
  let status: string | undefined;

  if (params.existingSquarePaymentId) {
    try {
      const response = await client.payments.get({ paymentId: params.existingSquarePaymentId });
      const payment = (response as any)?.payment;
      if (!payment?.id) {
        return { ok: false, status: 502, message: 'Could not verify payment with Square' };
      }
      paymentId = payment.id;
      status = payment.status;
    } catch (err) {
      console.error('[squarePosPaymentAdapter] payments.get (retry path) failed:', err);
      return { ok: false, status: 502, message: 'Could not verify payment with Square' };
    }
  } else {
    try {
      const response = await client.payments.create({
        idempotencyKey: buildSquareIdempotencyKey(['pos', params.posRequestId]),
        sourceId: params.sourceId,
        amountMoney: toSquareMoney(params.amountCents),
        ...(params.appFeeCents > 0 ? { appFeeMoney: toSquareMoney(params.appFeeCents) } : {}),
        locationId: params.organizer.squareLocationId!,
        // Delayed capture -- see file header for the researched hold-window rationale.
        autocomplete: false,
        referenceId: params.posRequestId.slice(0, 40),
        note: 'FindA.Sale POS payment request',
      } as any);
      const payment = (response as any)?.payment;
      if (!payment?.id) {
        return { ok: false, status: 400, message: DECLINE_MESSAGE };
      }
      paymentId = payment.id;
      status = payment.status;
    } catch (err) {
      if (err instanceof SquareError) {
        const first = (err as any).errors?.[0];
        console.warn(
          `[squarePosPaymentAdapter] Square CreatePayment decline/error: ${first?.code || 'SQUARE_ERROR'} -- ${first?.detail || err.message}`
        );
        return { ok: false, status: 400, message: DECLINE_MESSAGE };
      }
      console.error('[squarePosPaymentAdapter] Square CreatePayment failed:', err);
      return { ok: false, status: 500, message: 'Failed to create Square payment' };
    }
  }

  if (status === 'COMPLETED') {
    // Already captured (either a prior attempt's CompletePayment DID succeed and only the
    // response back to the shopper's browser was lost, or this is a genuine same-key retry).
    return { ok: true, paymentId, captured: true };
  }

  if (status !== 'APPROVED') {
    // CANCELED / FAILED -- Square already resolved this payment as unusable. Do not retry.
    return { ok: false, status: 400, message: DECLINE_MESSAGE };
  }

  try {
    const completeResponse = await client.payments.complete({ paymentId });
    const completedPayment = (completeResponse as any)?.payment;
    if (completedPayment?.status === 'COMPLETED') {
      return { ok: true, paymentId, captured: true };
    }
    // Complete call succeeded but didn't return COMPLETED -- treat as held, not failed; the
    // authorization is real and safely sitting in Square's own delayed-capture window.
    return { ok: true, paymentId, captured: false, delayedUntil: completedPayment?.delayedUntil };
  } catch (err) {
    console.error(
      '[squarePosPaymentAdapter] Square CompletePayment failed (payment remains APPROVED/held):',
      err
    );
    return { ok: true, paymentId, captured: false };
  }
}
