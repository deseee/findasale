import { SquareError } from 'square';
import { prisma } from '../lib/prisma';
import { getSquareClientForMerchant } from '../utils/square';
import { squareAppFeeNetOfProcessingCents } from '../utils/feeCalculator'; // 2026-10-11: platform bears Square's card processing cost
import {
  resolveOrganizerSquareAccessToken,
  SquareOnboardingIncompleteError,
  toSquareMoney,
} from './squarePaymentService';

/**
 * Square Checkout Link Service -- Square changeover Wave S1 (2026-09-09)
 *
 * Shared choke point for every "give someone a URL to pay later" flow this migration needs:
 * Bounty purchase (synchronous -- NOT this file, see squarePaymentService.ts's
 * createSquareCharge), Auction winner payment, Hold-to-Pay invoice creation
 * (reservationController.ts / posController.ts), and POS QR payment links
 * (posController.ts's createPaymentLinkInternal). Real architectural finding from the
 * architect's scoping pass (claude_docs/feature-notes/
 * square-changeover-remaining-work-scoping-2026-09-09.md, Section 1.2): Stripe uses TWO
 * different objects for this ("give someone a URL to pay later") -- a Checkout Session for
 * HoldInvoice, a Payment Link for POSPaymentLink -- but Square has exactly ONE primitive for
 * both, `CreatePaymentLink` (Square's Checkout API, Quick Pay Checkout mode). This file wraps
 * that single primitive so every future caller shares one implementation instead of five
 * separate ad-hoc Square integrations.
 *
 * Confirmed against the live SDK source this session (square@45.1.0, the version pinned in
 * packages/backend/package.json) -- NOT assumed from older docs/examples -- via
 * unpkg.com/square@45.1.0: `client.checkout.paymentLinks.create/update/delete` is a real,
 * currently-shipped nested resource client (api/resources/checkout/resources/paymentLinks/
 * client/Client.d.ts). `CreatePaymentLinkRequest.quickPay` takes `{ name, priceMoney,
 * locationId }`; `CheckoutOptions.appFeeMoney` is the Square analog of Stripe's
 * `application_fee_amount` (requires PAYMENTS_WRITE_ADDITIONAL_RECIPIENTS scope -- already on
 * SQUARE_OAUTH_SCOPES per squareConnectService.ts); `DeletePaymentLinkResponse` confirms
 * deleting a link cancels its underlying Order (`cancelledOrderId`), matching the architect's
 * finding that this is the direct equivalent of
 * `stripe().paymentLinks.update({ active: false })`.
 *
 * DELIBERATE DESIGN CHOICE -- token resolution lives INSIDE this service, not the caller:
 * unlike squarePaymentService.ts's createSquareCharge (which takes an already-resolved
 * organizerAccessToken + locationId because it only ever had 2 callers), this service will
 * gain 5 callers across Wave S2 (bounty is NOT one of them -- bounty is synchronous
 * CreatePayment, not a checkout link). Centralizing the organizer lookup +
 * resolveOrganizerSquareAccessToken() call here once, instead of duplicating that boilerplate
 * in every future call site, is the whole point of building this as a shared file. The
 * SquareOnboardingIncompleteError fail-closed contract is unchanged and still exported from
 * squarePaymentService.ts -- callers catch it exactly the same way squarePaymentController.ts
 * already does today.
 *
 * SQUARE HAS NO METADATA FIELD ON A PAYMENT LINK: confirmed via the live
 * CreatePaymentLinkRequest type -- there is no arbitrary key/value metadata field anywhere on
 * PaymentLink or CreatePaymentLinkRequest. The closest available hook is `paymentNote`
 * (<=500 chars, attached to the resulting Payment once paid -- same field
 * squarePaymentService.ts's createSquareCharge already truncates at 500 for its analogous
 * `note` parameter). `metadata` below is therefore a BEST-EFFORT, lossy passthrough encoded
 * into `paymentNote` as `key=value;key=value` -- it is NOT a substitute for real correlation.
 * Callers that need durable correlation must key off the returned `paymentLinkId`/`orderId`
 * and their own DB row (HoldInvoice/POSPaymentLink), not this note.
 *
 * KNOWN GAP, NOT FIXED HERE (flagged for Wave S2, out of scope for this dispatch): Purchase's
 * existing idempotency backstop is a compound partial unique index on
 * `(stripePaymentIntentId, itemId)` (see holdInvoicePaymentRecorder.ts /
 * posPaymentLinkRecorder.ts). A SQUARE-processor Purchase row never populates
 * stripePaymentIntentId (only squarePaymentId), so that constraint does NOT backstop a
 * concurrent double-record race for a Square-paid sale the way it does for Stripe today. A
 * matching partial unique index on `(squarePaymentId, itemId)` is a real follow-up schema
 * change once Wave S2 actually wires Square payments through these recorders for real
 * traffic -- not made here per this dispatch's explicit "no schema.prisma edits" constraint.
 */

interface SquareCheckoutOrganizer {
  id: string;
  squareMerchantId: string | null;
  squareOnboarded: boolean;
  squareLocationId: string | null;
}

async function resolveOrganizerForSquareCheckout(organizerId: string): Promise<SquareCheckoutOrganizer> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { id: true, squareMerchantId: true, squareOnboarded: true, squareLocationId: true },
  });
  if (!organizer) {
    throw new Error(`[squareCheckoutLinkService] Organizer ${organizerId} not found.`);
  }
  return organizer;
}

/** Best-effort, lossy metadata -> paymentNote encoding. See file header for why this is not a
 *  real metadata mechanism. Returns undefined when there is nothing to encode so callers never
 *  send an empty paymentNote. */
function encodeMetadataAsPaymentNote(metadata?: Record<string, string>): string | undefined {
  if (!metadata) return undefined;
  const entries = Object.entries(metadata).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return undefined;
  return entries.map(([k, v]) => `${k}=${v}`).join(';').slice(0, 500);
}

export interface CreateSquareCheckoutLinkParams {
  organizerId: string;
  /**
   * Required, NOT optional -- Square's own docs warn that omitting idempotencyKey (or passing
   * an empty string) makes the endpoint "treat each request as independent," so a caller
   * retry with no key would mint a second, duplicate payable link for the same sale. Every
   * future Wave S2 caller (auction-close cron, Hold-to-Pay invoice creation, POS QR link
   * creation) already has a natural stable key (auction id, invoice id, link id) to pass --
   * mirrors buildSquareIdempotencyKey's existing callers in squarePaymentController.ts.
   */
  idempotencyKey: string;
  amountCents: number;
  description: string;
  /** The sale's INCLUSIVE platform fee. 0 means no application fee (e.g. a fully platform-absorbed sale) -- omitted from the
   *  request entirely in that case, matching createSquareCharge's own `appFeeCents > 0` gate. The app_fee_money actually
   *  sent to Square is this MINUS Square's estimated processing cost (squareAppFeeNetOfProcessingCents, Patrick decision
   *  2026-10-11: the platform bears Square's cost), applied once here so every link caller (POS link, hold invoices,
   *  guest invoices, auction winner links, bulk-lot holds) is covered. Callers pass the inclusive fee and record it. */
  appFeeCents: number;
  /** Best-effort only -- see file header "SQUARE HAS NO METADATA FIELD" note. */
  metadata?: Record<string, string>;
}

export interface CreateSquareCheckoutLinkSuccess {
  ok: true;
  paymentLinkId: string;
  /** The underlying Square Order id -- needed later to look up whether/how this link was
   *  paid (SearchOrders), per the architect's Wave S3 open item. Null only if Square's
   *  response is ever missing it (defensive -- not expected in practice). */
  orderId: string | null;
  url: string;
  longUrl: string | null;
}

export interface CreateSquareCheckoutLinkFailure {
  ok: false;
  /** Square error code (e.g. INVALID_REQUEST_ERROR variants) -- logged, never shown verbatim
   *  to the buyer, same "don't leak processor internals" posture as
   *  squarePaymentService.ts's createSquareCharge. */
  code: string;
  /** Buyer/organizer-facing, deliberately generic. */
  message: string;
}

export type CreateSquareCheckoutLinkResult = CreateSquareCheckoutLinkSuccess | CreateSquareCheckoutLinkFailure;

const CREATE_LINK_FAILURE_MESSAGE = "We couldn't generate a payment link right now. Please try again in a moment.";

/**
 * Creates a Square-hosted checkout page (Quick Pay Checkout mode -- an ad hoc amount, not a
 * full itemized Order) via the CONNECTED ORGANIZER's own OAuth access token, exactly the same
 * per-organizer-token requirement documented in squarePaymentService.ts's file header (Square's
 * app_fee_money model requires the entire client to be authorized as the merchant -- there is
 * no cheaper per-request scoping the way Stripe's Destination-charge `stripeAccount` option
 * provides). Throws SquareOnboardingIncompleteError (fail-closed, never fabricates a token or
 * a location id) if the organizer hasn't completed Square onboarding or has no
 * squareLocationId on file -- callers catch this exactly like every existing
 * resolveOrganizerSquareAccessToken() call site already does.
 *
 * A genuine Square API error (bad request, auth failure, etc.) returned once the call is made
 * is NOT thrown -- it is returned as a discriminated `{ ok: false, code, message }` result,
 * mirroring createSquareCharge's synchronous-decline handling convention so every caller in
 * this codebase already knows this file's error shape.
 */
export async function createSquareCheckoutLink(
  params: CreateSquareCheckoutLinkParams
): Promise<CreateSquareCheckoutLinkResult> {
  const organizer = await resolveOrganizerForSquareCheckout(params.organizerId);
  if (!organizer.squareLocationId) {
    // Fail closed -- same posture as resolveOrganizerSquareAccessToken: never fabricate a
    // location id. In practice this should already imply !squareOnboarded (Wave 0's callback
    // persists squareLocationId at onboarding time), but this is a real precondition for
    // QuickPay specifically, so it is checked explicitly rather than assumed.
    throw new SquareOnboardingIncompleteError(params.organizerId);
  }

  const accessToken = await resolveOrganizerSquareAccessToken(organizer);
  const client = getSquareClientForMerchant(accessToken);

  const description = (params.description || 'FindA.Sale payment').trim();
  const paymentNote = encodeMetadataAsPaymentNote(params.metadata);
  const sentAppFeeCents = squareAppFeeNetOfProcessingCents(params.appFeeCents, params.amountCents);

  try {
    const response = await client.checkout.paymentLinks.create({
      idempotencyKey: params.idempotencyKey,
      description: description.slice(0, 4096),
      quickPay: {
        name: description.slice(0, 500),
        priceMoney: toSquareMoney(params.amountCents),
        locationId: organizer.squareLocationId,
      },
      ...(sentAppFeeCents > 0
        ? { checkoutOptions: { appFeeMoney: toSquareMoney(sentAppFeeCents) } }
        : {}),
      ...(paymentNote ? { paymentNote } : {}),
    } as any);

    const paymentLink = (response as any)?.paymentLink;
    if (!paymentLink?.id || !paymentLink?.url) {
      console.error(
        `[squareCheckoutLinkService] CreatePaymentLink for organizer ${params.organizerId} returned no usable paymentLink:`,
        response
      );
      return { ok: false, code: 'NO_PAYMENT_LINK_IN_RESPONSE', message: CREATE_LINK_FAILURE_MESSAGE };
    }

    return {
      ok: true,
      paymentLinkId: paymentLink.id,
      orderId: paymentLink.orderId ?? null,
      url: paymentLink.url,
      longUrl: paymentLink.longUrl ?? null,
    };
  } catch (err) {
    if (err instanceof SquareError) {
      const first = err.errors?.[0];
      const code = first?.code || 'SQUARE_ERROR';
      console.warn(
        `[squareCheckoutLinkService] Square error creating payment link for organizer ${params.organizerId}: ${code} -- ${first?.detail || err.message}`
      );
      return { ok: false, code, message: CREATE_LINK_FAILURE_MESSAGE };
    }
    throw err;
  }
}

export interface GetSquareOrderPaymentStatusParams {
  organizerId: string;
  orderId: string;
}

export interface GetSquareOrderPaymentStatusSuccess {
  ok: true;
  /** Square Order.state -- 'OPEN' | 'COMPLETED' | 'CANCELED' per Square's Orders API
   *  (confirmed via a live fetch of developer.squareup.com/reference/square/objects/Order,
   *  2026-09-09). An Order reaches COMPLETED once it has been paid in full -- this is the
   *  reliable "was it paid?" signal for a Quick Pay Checkout link, since Square's Payment
   *  Links API itself documents no simpler single-call answer to that question (no
   *  `checkout.sessions.list({ payment_link })` equivalent exists -- see
   *  posStrandedSaleReconcileCron.ts's Square branch, the caller of this function). */
  state: string;
  paid: boolean;
  /** Best-effort real Square Payment id for the completed order, extracted from the Order's
   *  (Beta, legacy but still populated) `tenders[].paymentId` field. Null if the order isn't
   *  paid yet, or if Square's response ever omits tenders/paymentId (defensive -- callers must
   *  tolerate this and fall back to their own recorder's synthetic-id path, exactly like every
   *  other caller of recordPosPaymentLinkSale already does for a missing externalPaymentId). */
  paymentId: string | null;
}

export interface GetSquareOrderPaymentStatusFailure {
  ok: false;
  code: string;
  message: string;
}

export type GetSquareOrderPaymentStatusResult = GetSquareOrderPaymentStatusSuccess | GetSquareOrderPaymentStatusFailure;

const GET_ORDER_STATUS_FAILURE_MESSAGE = 'Failed to check the Square order status.';

/**
 * Reconciliation helper -- Square changeover Wave S3 (2026-09-09), for
 * posStrandedSaleReconcileCron.ts's Square branch. Square's Checkout API (Payment Links) has
 * no session-list/retrieve endpoint the way Stripe's `checkout.sessions.list({ payment_link })`
 * does (confirmed by the architect's scoping pass, claude_docs/feature-notes/
 * square-changeover-remaining-work-scoping-2026-09-09.md Section 1 Wave S3 #2) -- but every
 * Quick Pay Checkout link creates an underlying Order (`createSquareCheckoutLink`'s own
 * `orderId` return value), and Square's Orders API DOES support a direct RetrieveOrder-by-id
 * call (`client.orders.get({ orderId })`, confirmed via a live fetch of
 * developer.squareup.com/reference/square/orders-api/retrieve-order this dispatch) -- simpler
 * and more direct than SearchOrders (which is for filtering across many orders) since the
 * caller already has the exact order id stored on its own POSPaymentLink/HoldInvoice row.
 * Mirrors this file's own createSquareCheckoutLink/deleteSquareCheckoutLink error-handling
 * convention: a genuine Square API error is returned as a discriminated result, never thrown
 * (except SquareOnboardingIncompleteError, same fail-closed posture as every other function
 * here).
 */
export async function getSquareOrderPaymentStatus(
  params: GetSquareOrderPaymentStatusParams
): Promise<GetSquareOrderPaymentStatusResult> {
  const organizer = await resolveOrganizerForSquareCheckout(params.organizerId);
  const accessToken = await resolveOrganizerSquareAccessToken(organizer);
  const client = getSquareClientForMerchant(accessToken);

  try {
    const response = await client.orders.get({ orderId: params.orderId });
    const order = (response as any)?.order;
    if (!order?.state) {
      console.error(
        `[squareCheckoutLinkService] RetrieveOrder for organizer ${params.organizerId} order ${params.orderId} returned no usable order:`,
        response
      );
      return { ok: false, code: 'NO_ORDER_IN_RESPONSE', message: GET_ORDER_STATUS_FAILURE_MESSAGE };
    }
    const paid = order.state === 'COMPLETED';
    const paymentId: string | null = paid
      ? (Array.isArray(order.tenders) && order.tenders.length > 0 ? (order.tenders[0]?.paymentId ?? null) : null)
      : null;
    return { ok: true, state: order.state, paid, paymentId };
  } catch (err) {
    if (err instanceof SquareError) {
      const first = err.errors?.[0];
      const code = first?.code || 'SQUARE_ERROR';
      console.warn(
        `[squareCheckoutLinkService] Square error retrieving order ${params.orderId} for organizer ${params.organizerId}: ${code} -- ${first?.detail || err.message}`
      );
      return { ok: false, code, message: GET_ORDER_STATUS_FAILURE_MESSAGE };
    }
    throw err;
  }
}

export interface DeleteSquareCheckoutLinkParams {
  organizerId: string;
  paymentLinkId: string;
}

export interface DeleteSquareCheckoutLinkSuccess {
  ok: true;
  /** The Order id Square canceled as a side effect of deleting the link, per
   *  DeletePaymentLinkResponse -- null if Square's response omits it (defensive). */
  cancelledOrderId: string | null;
}

export interface DeleteSquareCheckoutLinkFailure {
  ok: false;
  code: string;
  message: string;
}

export type DeleteSquareCheckoutLinkResult = DeleteSquareCheckoutLinkSuccess | DeleteSquareCheckoutLinkFailure;

const DELETE_LINK_FAILURE_MESSAGE = 'Failed to cancel the Square payment link.';

/**
 * Cancels/deletes a Square payment link -- the direct equivalent of
 * `stripe().paymentLinks.update({ active: false })` already used by
 * posPaymentLinkRecorder.ts / posStrandedSaleReconcileCron.ts, except Square's DeletePaymentLink
 * additionally cancels the underlying Order (Stripe's `active:false` does not cancel anything,
 * it only stops the link from accepting new payments). This dispatch only builds the function
 * per the Wave S1 scope -- callers (the future expiry/revert crons per architect scoping
 * Section 1.3: invoiceExpiryJob.ts / posStrandedSaleReconcileCron.ts gaining a new "actively
 * call DeletePaymentLink at the real deadline" duty) are wired in a later dispatch, not here.
 *
 * Never throws for an ordinary Square API failure -- returns a discriminated result so a
 * non-fatal caller (a revert/expiry cron) can log-and-continue without a try/catch of its own,
 * matching this file's createSquareCheckoutLink convention. Still throws
 * SquareOnboardingIncompleteError if the organizer's Square token can't be resolved at all
 * (fail-closed, same as every other Square call site).
 */
export async function deleteSquareCheckoutLink(
  params: DeleteSquareCheckoutLinkParams
): Promise<DeleteSquareCheckoutLinkResult> {
  const organizer = await resolveOrganizerForSquareCheckout(params.organizerId);
  const accessToken = await resolveOrganizerSquareAccessToken(organizer);
  const client = getSquareClientForMerchant(accessToken);

  try {
    const response = await client.checkout.paymentLinks.delete({ id: params.paymentLinkId });
    const result = (response as any) ?? {};
    return { ok: true, cancelledOrderId: result.cancelledOrderId ?? null };
  } catch (err) {
    if (err instanceof SquareError) {
      const first = err.errors?.[0];
      const code = first?.code || 'SQUARE_ERROR';
      console.warn(
        `[squareCheckoutLinkService] Square error deleting payment link ${params.paymentLinkId} for organizer ${params.organizerId}: ${code} -- ${first?.detail || err.message}`
      );
      return { ok: false, code, message: DELETE_LINK_FAILURE_MESSAGE };
    }
    throw err;
  }
}
