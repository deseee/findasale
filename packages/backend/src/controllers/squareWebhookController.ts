import { Request, Response } from 'express';
import { WebhooksHelper } from 'square';
import * as Sentry from '@sentry/node'; // 2026-09-29 money review P1-3: alert on a Square payment that does not match the record it claims to pay
import { prisma } from '../lib/prisma';
import { createNotification } from '../lib/notificationService';
import { handleSquareDisputeWebhook, type SquareDisputeWebhookEvent } from '../services/squareRefundService'; // findasale-hacker fix-and-reverify (2026-09-08): wire the REAL dispute handler -- squareRefundService.ts's handleSquareDisputeWebhook was fully built for exactly this call site (see its own doc comment) but was never actually invoked here; the dispute.created/dispute.state.updated cases below were silently calling a local log-only stub instead, meaning real Square chargebacks were never processed (no DISPUTED/DISPUTE_LOST status, no serial-chargeback buyer suspension, no organizer notification, no chargeback-rate metric). See VALID-STATE-ONLY-EXPOSURE finding in the 2026-09-08 security-QA pass.
import { markHoldInvoicePaid } from '../services/holdInvoicePaymentRecorder'; // Square changeover Wave S2 #3 (2026-09-09): wires the payment.updated stub below to actually record a Hold-to-Pay invoice as PAID -- see HOLD_INVOICE_NOTE_KEY import below for how the invoice is found.
import { HOLD_INVOICE_NOTE_KEY } from '../services/holdInvoiceSquareCheckoutHelper'; // the paymentNote key holdInvoiceSquareCheckoutHelper.ts encodes a HoldInvoice.id into at link-creation time
import { fireSquarePurchaseEngagement } from '../services/squarePurchaseEngagementService'; // 2026-09-29 Sale Passport wiring: XP, milestones, referral, badge, achievement and passport stamp for a paid Square link purchase (idempotent, never throws)
import { recordPosPaymentLinkSale } from '../services/posPaymentLinkRecorder'; // Square changeover Wave S3 follow-up (2026-09-09): direct squareOrderId match for POSPaymentLink, see the new branch in syncSquarePaymentStatus below

/**
 * Square webhook payload envelope shape (confirmed via live fetch of Square's webhook event
 * catalog + individual event-type reference pages, 2026-09-07 -- see the Wave 1 #5 dispatch
 * handoff for citations). EVERY Square webhook event (unlike Stripe) carries
 * merchant_id/event_id/type at the TOP level of the envelope, not nested inside data.object.
 */
export interface SquareWebhookEnvelope {
  merchant_id?: string;
  location_id?: string;
  type: string;
  event_id: string;
  created_at?: string;
  data?: {
    type?: string;
    id?: string;
    object?: Record<string, any>;
  };
}

/**
 * Sale Passport wiring (2026-09-29): a Hold-to-Pay invoice paid online creates ONLINE Purchase rows
 * keyed by the Square payment id. Give a logged-in payer the same engagement awards as any other
 * purchase (purchase XP, milestones, referral, OG Buyer badge, achievement, passport stamp). Safe on
 * webhook retries: the award is idempotent and skips guest, POS-cash, test and non-PAID rows. Never
 * throws, so it can never turn this webhook into a 500 retry.
 */
async function fireEngagementForSquareHoldInvoicePayment(invoiceId: string, squarePaymentId: unknown): Promise<void> {
  if (typeof squarePaymentId !== 'string' || !squarePaymentId) return;
  try {
    const invoicePurchase = await prisma.purchase.findFirst({
      where: { squarePaymentId, userId: { not: null }, isTestTransaction: false },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (invoicePurchase) fireSquarePurchaseEngagement(invoicePurchase.id);
  } catch (engagementErr) {
    console.warn(`[square-webhook] engagement lookup for hold invoice ${invoiceId} failed (non-fatal):`, engagementErr);
  }
}

/**
 * Square changeover Wave S2 #3 (2026-09-09), extended Wave S2 #2 follow-up (2026-09-09):
 * Wave 1 #1's direct/synchronous Square checkout (squarePaymentController.ts's
 * createSquarePayment) never goes through this webhook at all (it records the Purchase
 * inline, in the same request/response cycle, per that file's own header comment), so this
 * function handles the two "pay later via a hosted link" cases:
 *
 * 1. Hold-to-Pay invoice: reservationController.ts's markSoldAndCreateInvoice and
 *    posController.ts's sendHoldInvoice both create a Square Payment Link via
 *    holdInvoiceSquareCheckoutHelper.ts's createHoldInvoiceSquareCheckout, which embeds the
 *    pre-generated HoldInvoice.id into the link's paymentNote (key: HOLD_INVOICE_NOTE_KEY).
 *    Square attaches that paymentNote to the resulting Payment once paid (confirmed via
 *    squareCheckoutLinkService.ts's own header comment, sourced from Square's live docs) --
 *    so a COMPLETED payment.updated event carries `payment.note` = "invoiceId=<uuid>",
 *    decoded below to find the exact HoldInvoice row and call markHoldInvoicePaid, the same
 *    single source of truth stripeController.ts's charge.succeeded handler and
 *    invoiceExpiryJob.ts's reconcile branch already use for the Stripe side.
 *
 * 2. Auction winner payment link: jobs/auctionJob.ts's cron and
 *    services/auctionService.ts's closeAuction both create a Square Payment Link via
 *    createSquareCheckoutLink and persist the returned paymentLinkId/orderId directly on the
 *    PENDING Purchase row (Purchase.squarePaymentLinkId/squareOrderId, schema addition
 *    2026-09-09) instead of a paymentNote key -- no HoldInvoice note match falls through to
 *    look up that Purchase row by squareOrderId (falling back to squarePaymentLinkId) and
 *    flips it PAID + squarePaymentId. Before this, a paid Square auction-win link had no
 *    mechanism to ever reach PAID.
 *
 * Any OTHER Square payment (no invoiceId note, no matching PENDING Purchase -- e.g. a future
 * Wave S2 bounty/POS-QR Square payment link not yet wired the same way, or Wave 1 #1's
 * direct-charge Purchase, which never reaches this function) is a deliberate no-op here.
 */
/**
 * Money review P1-3 (2026-09-29): a COMPLETED Square payment used to be trusted on the strength of
 * ONE field (an order id or a paymentNote) with nothing checked about the payment itself. A
 * payment that named an invoice but was for a different order, a smaller amount, another currency,
 * or another merchant/location was still recorded as paying it in full. Before a payment flips a
 * HoldInvoice or POSPaymentLink to PAID it must now match the stored record:
 *   - order_id equals the order id stored when the link was created (when one is stored)
 *   - amount_money is at least the expected CARD-leg amount (a tip or fee only adds)
 *   - currency is USD
 *   - the event's merchant id equals the organizer's stored squareMerchantId, and the payment's
 *     location_id equals the stored squareLocationId (each check is skipped only when the value on
 *     either side is genuinely absent, and that is logged)
 * Any mismatch logs a Sentry warning and returns without recording. It is NOT thrown: the webhook
 * answers 200, so Square does not retry an event that can never verify. The invoice stays PENDING,
 * and the expiry job's own Square paid-check settles it against the real order.
 */
export type SquarePaymentVerification = { ok: true } | { ok: false; reason: string };

const paymentAmountToCents = (v: unknown): number | null => {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
  return null;
};

export async function verifySquarePaymentAgainstRecord(params: {
  kind: 'HOLD_INVOICE' | 'POS_PAYMENT_LINK';
  recordId: string;
  payment: any;
  storedOrderId: string | null | undefined;
  expectedCardCents: number;
  organizerProfileId: string | null | undefined;
  envelopeMerchantId?: string;
}): Promise<SquarePaymentVerification> {
  const { kind, recordId, payment, storedOrderId, expectedCardCents, organizerProfileId, envelopeMerchantId } = params;

  const reject = (reason: string): SquarePaymentVerification => {
    const msg = `[square-webhook] PAYMENT-MISMATCH ${kind} ${recordId} payment=${payment?.id ?? 'unknown'}: ${reason}. NOT recorded as paid.`;
    console.error(msg);
    try {
      Sentry.captureMessage(msg, {
        level: 'warning',
        tags: { area: 'square-webhook-payment-mismatch', kind },
        extra: {
          recordId,
          paymentId: payment?.id ?? null,
          paymentOrderId: payment?.order_id ?? null,
          storedOrderId: storedOrderId ?? null,
          expectedCardCents,
          amountMoney: payment?.amount_money ?? null,
          paymentLocationId: payment?.location_id ?? null,
          envelopeMerchantId: envelopeMerchantId ?? null,
          reason,
        },
      } as any);
    } catch {
      // Sentry may not be initialized -- the console.error above is the fallback record.
    }
    return { ok: false, reason };
  };

  if (storedOrderId) {
    if (payment?.order_id !== storedOrderId) {
      return reject(`payment order_id ${payment?.order_id ?? 'none'} does not match the stored order ${storedOrderId}`);
    }
  } else {
    console.warn(`[square-webhook] ${kind} ${recordId} has no stored Square order id; order_id cannot be verified for payment ${payment?.id ?? 'unknown'}.`);
  }

  const paidCents = paymentAmountToCents(payment?.amount_money?.amount);
  if (paidCents === null) return reject('payment has no readable amount_money');
  if (paidCents < expectedCardCents) {
    return reject(`paid ${paidCents} cents is less than the expected ${expectedCardCents} cents`);
  }
  const currency = payment?.amount_money?.currency;
  if (currency !== 'USD') return reject(`currency ${currency ?? 'none'} is not USD`);

  if (organizerProfileId) {
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerProfileId },
      select: { squareMerchantId: true, squareLocationId: true },
    });
    if (organizer?.squareMerchantId && envelopeMerchantId) {
      if (organizer.squareMerchantId !== envelopeMerchantId) {
        return reject(`event merchant ${envelopeMerchantId} is not the organizer's merchant`);
      }
    } else {
      console.warn(`[square-webhook] ${kind} ${recordId}: merchant id not verifiable (stored=${organizer?.squareMerchantId ? 'yes' : 'no'}, event=${envelopeMerchantId ? 'yes' : 'no'}).`);
    }
    if (organizer?.squareLocationId && typeof payment?.location_id === 'string') {
      if (organizer.squareLocationId !== payment.location_id) {
        return reject(`payment location ${payment.location_id} is not the organizer's location`);
      }
    }
  }
  return { ok: true };
}

/** The card-leg total, in cents, a Square payment on this invoice must cover. */
const holdInvoiceExpectedCardCents = (inv: { totalAmount: number; cashAmountCents?: number | null; cardAmountCents?: number | null }): number => {
  if (typeof inv.cardAmountCents === 'number' && inv.cardAmountCents > 0) return inv.cardAmountCents;
  const cash = inv.cashAmountCents && inv.cashAmountCents > 0 ? inv.cashAmountCents : 0;
  const remainder = inv.totalAmount - cash;
  return remainder > 0 ? remainder : inv.totalAmount;
};

/**
 * Verify a completed Square payment against its HoldInvoice, then record it. Shared by the
 * direct order-id match and the paymentNote-decode path so both apply the same checks. A throw
 * from markHoldInvoicePaid deliberately propagates (webhook 500, Square retries with backoff).
 */
async function verifyAndRecordHoldInvoicePayment(
  invoiceId: string,
  payment: any,
  envelopeMerchantId: string | undefined
): Promise<void> {
  const invoice = await prisma.holdInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      squareOrderId: true,
      totalAmount: true,
      cashAmountCents: true,
      cardAmountCents: true,
      sale: { select: { organizerId: true } },
    },
  });
  if (invoice) {
    const check = await verifySquarePaymentAgainstRecord({
      kind: 'HOLD_INVOICE',
      recordId: invoice.id,
      payment,
      storedOrderId: invoice.squareOrderId,
      expectedCardCents: holdInvoiceExpectedCardCents(invoice),
      organizerProfileId: invoice.sale?.organizerId ?? null,
      envelopeMerchantId,
    });
    if (!check.ok) return;
  }
  // No row found: markHoldInvoicePaid logs "Invoice not found" and returns unrecorded, as before.

  const result = await markHoldInvoicePaid(
    invoiceId,
    { processor: 'SQUARE', externalPaymentId: payment?.id ?? null },
    { source: 'webhook' }
  );
  if (result.deadInvoice) {
    console.error(`[square-webhook] payment.updated for Square payment ${payment?.id} landed on dead HoldInvoice ${invoiceId} -- see reportDeadInvoicePayment alert.`);
  } else if (!result.recorded && !result.alreadyPaid) {
    console.error(`[square-webhook] markHoldInvoicePaid returned neither recorded nor alreadyPaid for invoice ${invoiceId}, payment ${payment?.id}.`);
  }
  // Sale Passport wiring (2026-09-29): see fireEngagementForSquareHoldInvoicePayment.
  if (result.recorded || result.alreadyPaid) await fireEngagementForSquareHoldInvoicePayment(invoiceId, payment?.id);
}

export async function syncSquarePaymentStatus(
  eventType: 'payment.created' | 'payment.updated',
  payment: any,
  // Envelope merchant_id of the event (2026-09-29, money review P1-3): checked against the
  // organizer's stored merchant before a payment is allowed to mark anything PAID.
  merchantId?: string
): Promise<void> {
  console.log(
    `[square-webhook] ${eventType} received for Square payment ${payment?.id ?? 'unknown'} ` +
    `(status=${payment?.status ?? 'unknown'}, order_id=${payment?.order_id ?? 'unknown'})`
  );

  // Only a COMPLETED payment represents money actually captured -- mirrors
  // stripeController.ts only recording on charge.succeeded, never on an intermediate
  // PaymentIntent state. payment.created events (and any non-COMPLETED payment.updated,
  // e.g. APPROVED/CANCELED/FAILED) are logged above and otherwise ignored here.
  if (eventType !== 'payment.updated' || payment?.status !== 'COMPLETED') {
    return;
  }

  // Square changeover Wave S3 follow-up (2026-09-09): direct-ID-match branch, tried FIRST --
  // cheaper and more direct than the paymentNote-decode path below. Both POSPaymentLink
  // (Wave S2 #4) and HoldInvoice (Wave S2 #3 follow-up) now persist the exact squareOrderId
  // createSquareCheckoutLink returned at creation time, so a completed payment can usually be
  // matched straight off payment.order_id with no note-decoding needed.
  //
  // No fallback to a squarePaymentLinkId match here when order_id is absent: Square's Payment
  // object (confirmed via this dispatch's live doc read of the Orders/Payments API reference)
  // exposes order_id but no payment-link-id field, so there is no second identifier on the
  // payment payload itself to key off. If order_id is ever missing, this branch is skipped
  // (logged below) and control falls through to the paymentNote-decode path, which still
  // covers HoldInvoice (POSPaymentLink never adopted a paymentNote correlator, since -- unlike
  // HoldInvoice -- its DB row always exists by the time Square's CreatePaymentLink call
  // returns, so a direct squareOrderId match is sufficient and no note-based backstop is
  // needed).
  const orderId: string | undefined = typeof payment?.order_id === 'string' ? payment.order_id : undefined;
  if (orderId) {
    const posLink = await prisma.pOSPaymentLink.findFirst({ where: { squareOrderId: orderId } });
    if (posLink) {
      const posCheck = await verifySquarePaymentAgainstRecord({
        kind: 'POS_PAYMENT_LINK',
        recordId: posLink.id,
        payment,
        storedOrderId: posLink.squareOrderId,
        expectedCardCents: posLink.isSplitPayment && posLink.cardAmountCents ? posLink.cardAmountCents : posLink.amount,
        organizerProfileId: posLink.organizerId,
        envelopeMerchantId: merchantId,
      });
      if (!posCheck.ok) return;
      const result = await recordPosPaymentLinkSale(posLink, {
        source: 'webhook',
        processor: 'SQUARE',
        externalPaymentId: typeof payment?.id === 'string' ? payment.id : undefined,
      });
      if (!result.recorded && !result.alreadyCompleted) {
        console.error(`[square-webhook] recordPosPaymentLinkSale returned neither recorded nor alreadyCompleted for POSPaymentLink ${posLink.id}, payment ${payment?.id}.`);
      }
      return;
    }

    const holdInvoiceByOrder = await prisma.holdInvoice.findFirst({ where: { squareOrderId: orderId } });
    if (holdInvoiceByOrder) {
      await verifyAndRecordHoldInvoicePayment(holdInvoiceByOrder.id, payment, merchantId);
      return;
    }
    // order_id present but matched neither table directly -- fall through to the
    // paymentNote-decode path below (still covers a HoldInvoice created before this
    // dispatch's schema columns existed) and the auction-Purchase order_id/paymentLinkId
    // fallback further down.
  } else {
    console.warn(`[square-webhook] payment.updated for Square payment ${payment?.id} has no order_id -- skipping direct squareOrderId match, falling back to paymentNote decode.`);
  }

  const note: string | undefined = typeof payment?.note === 'string' ? payment.note : undefined;

  // Decodes the exact inverse of holdInvoiceSquareCheckoutHelper.ts's
  // createHoldInvoiceSquareCheckout -> squareCheckoutLinkService.ts's
  // encodeMetadataAsPaymentNote encoding (`key=value;key=value`, <=500 chars). Only the
  // single `invoiceId` key is ever written by that encoder for a Hold-to-Pay link today,
  // so a simple split is sufficient. A note IS present but with no invoiceId key for other
  // createSquareCheckoutLink callers (auction winner payment links encode
  // itemId/saleId/userId instead, see below) -- that is not a HoldInvoice payment, fall
  // through rather than returning early.
  let invoiceId: string | undefined;
  if (note) {
    for (const pair of note.split(';')) {
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      if (pair.slice(0, eq) === HOLD_INVOICE_NOTE_KEY) {
        invoiceId = pair.slice(eq + 1);
        break;
      }
    }
  }

  if (invoiceId) {
    // Deliberately NOT wrapped in a try/catch here -- a throw from markHoldInvoicePaid
    // propagates up through handleSquareWebhook's own try/catch (below), which marks the
    // idempotency row FAILED and returns 500 so Square retries with backoff. Same posture
    // as every other case in that switch (dispute/payout handling, etc.). The payment is
    // verified against the invoice's own record first (money review P1-3, 2026-09-29): a note
    // is text anyone can put on a payment, so it never counts as proof on its own.
    await verifyAndRecordHoldInvoicePayment(invoiceId, payment, merchantId);
    return;
  }

  // Square changeover Wave S2 #2 follow-up (2026-09-09): no HoldInvoice note match -- this may
  // be an auction-winner Square payment link (jobs/auctionJob.ts / services/auctionService.ts's
  // closeAuction), which persists Purchase.squarePaymentLinkId/squareOrderId at
  // link-creation time (Purchase schema addition, 2026-09-09) instead of a note key. Correlate
  // via those columns -- exactly the durable correlation mechanism
  // squareCheckoutLinkService.ts's own header comment calls out ("Callers that need durable
  // correlation must key off the returned paymentLinkId/orderId and their own DB row... not
  // this note"). Before this, a paid Square auction-win link had no mechanism to ever flip its
  // Purchase row from PENDING to PAID.
  // orderId already resolved above (direct-match branch) -- reused here, not re-declared.
  // Square's Payment object does not document a payment_link_id field (per the live SDK
  // reference squareCheckoutLinkService.ts's own header already confirmed for this migration) --
  // checked defensively only, since CreateSquareCheckoutLinkSuccess's own orderId can be null
  // ("not expected in practice" per that file), and this is the only other column a Purchase
  // row might be keyed on if it ever is.
  const paymentLinkId: string | undefined =
    typeof payment?.payment_link_id === 'string' ? payment.payment_link_id : undefined;

  if (!orderId && !paymentLinkId) return;

  const purchase = await prisma.purchase.findFirst({
    where: {
      status: 'PENDING',
      OR: [
        ...(orderId ? [{ squareOrderId: orderId }] : []),
        ...(paymentLinkId ? [{ squarePaymentLinkId: paymentLinkId }] : []),
      ],
    },
  });

  if (!purchase) {
    // 2026-09-30: a crash-retry lands here when the previous delivery flipped the row to PAID and died before
    // the engagement award. The award is idempotent per purchase, so fire it again for that exact payment.
    if (typeof payment?.id === 'string' && payment.id) {
      try {
        const alreadyPaid = await prisma.purchase.findFirst({
          where: {
            status: 'PAID',
            squarePaymentId: payment.id,
            userId: { not: null },
            OR: [
              ...(orderId ? [{ squareOrderId: orderId }] : []),
              ...(paymentLinkId ? [{ squarePaymentLinkId: paymentLinkId }] : []),
            ],
          },
          select: { id: true },
        });
        if (alreadyPaid) {
          console.log(`[square-webhook] Purchase ${alreadyPaid.id} already PAID for Square payment ${payment.id}; re-firing the (idempotent) engagement award.`);
          fireSquarePurchaseEngagement(alreadyPaid.id);
          return;
        }
      } catch (lookupErr) {
        console.warn(`[square-webhook] already-PAID lookup for Square payment ${payment.id} failed (non-fatal):`, lookupErr);
      }
    }
    console.log(
      `[square-webhook] payment.updated COMPLETED for Square payment ${payment?.id} matched no ` +
      `HoldInvoice note and no PENDING Purchase (order_id=${orderId ?? 'none'}, ` +
      `payment_link_id=${paymentLinkId ?? 'none'}) -- ignoring.`
    );
    return;
  }

  // Mirrors stripeController.ts's checkout.session.completed AUCTION_WINNER branch: that
  // branch's ONLY side effect is writing the Purchase row as PAID -- the item's status flip to
  // SOLD (sellItemUnits), stock sync, XP award and winner/organizer notifications all already
  // happened at auction-CLOSE time (both jobs/auctionJob.ts's cron and
  // services/auctionService.ts's closeAuction), well before the winner pays. So marking this
  // row PAID is the complete parity -- no additional item/notification side effects belong here.
  // 2026-09-30: conditional flip (status PENDING -> PAID), not a blind update. A redelivered or re-driven event
  // (stale-PENDING reprocess, Square retry after a crash) that races another delivery gets count 0 here and
  // stops, so the PAID write and the engagement award happen once.
  const paidFlip = await prisma.purchase.updateMany({
    where: { id: purchase.id, status: 'PENDING' },
    data: { status: 'PAID', squarePaymentId: payment?.id ?? null },
  });
  if (paidFlip.count === 0) {
    console.log(`[square-webhook] Purchase ${purchase.id} was already flipped by another delivery of Square payment ${payment?.id} -- nothing more to do.`);
    return;
  }
  console.log(
    `[square-webhook] Purchase ${purchase.id} (item ${purchase.itemId ?? 'unknown'}) marked PAID ` +
    `from Square payment ${payment?.id}.`
  );

  // Sale Passport wiring (2026-09-29): the PAID row is committed, so award the engagement side
  // effects a Stripe purchase gets (purchase XP, first-purchase milestones, referral, OG Buyer badge,
  // achievement, passport + legacy stamp). Off the response path, idempotent per purchase (the
  // synchronous checkout path can also fire for the same payment), and it never throws, so it can
  // never turn this webhook into a 500 retry.
  fireSquarePurchaseEngagement(purchase.id);
}

/**
 * TODO (Wave 1 #4 -- Refunds/disputes, squareRefundService.ts, a concurrent dispatch not yet
 * built at the time this file was written): integration point for refund status sync.
 */
async function syncSquareRefundStatus(refund: any): Promise<void> {
  console.log(
    `[square-webhook] refund.updated received for Square refund ${refund?.id ?? 'unknown'} ` +
    `(status=${refund?.status ?? 'unknown'}, payment_id=${refund?.payment_id ?? 'unknown'}) -- ` +
    `refund-sync integration point (see TODO above), not yet wired.`
  );
}

/**
 * TODO (Wave 1 #2 -- Connect-equivalent onboarding, squareConnectService.ts, a concurrent
 * dispatch not yet built at the time this file was written): THIS IS THE NAMED INTEGRATION
 * POINT for the bank-fingerprint fraud guard (mirrors connectAccountGuard.ts's
 * recordAndCheckBankFingerprints() on the Stripe side; writes should target
 * ConnectBankFingerprint rows with processor='SQUARE' per the Wave 0 schema addition).
 * Dispatch #2 should replace this stub's body -- or replace the call site below in
 * handleSquareWebhook -- with the real Square-side collision-detection logic, same
 * flag-don't-block posture as the Stripe guard (does not hard-block, since legitimate
 * shared-bank cases exist).
 *
 * NOTE (found live during this dispatch, 2026-09-07): Square's `BankAccount` object DOES
 * document a `fingerprint` field ("A Square-assigned, unique identifier for the bank account
 * based on the account information... can be used to compare account entries and determine
 * if they represent the same real-world bank account" --
 * developer.squareup.com/reference/square/objects/BankAccount) BUT the bank_account.verified
 * webhook's own example payload does NOT include `fingerprint` inside
 * `data.object.bank_account` (only id/account_number_suffix/country/currency/account_type/
 * holder_name/primary_bank_identification_number/location_id/status/creditable/debitable/
 * version/bank_name -- confirmed via a live fetch of that exact webhook's reference page).
 * This is new supporting evidence for the exact open question the scoping doc already
 * flagged for dispatch #2 ("whether Square exposes a connected merchant's bank-account
 * fingerprint via any API/webhook a third-party OAuth app can call... NOT confirmed") --
 * still unresolved here, not silently assumed either way. If the webhook payload truly omits
 * it, dispatch #2's documented polling fallback (GET /v2/merchants/{id} + the bank-accounts
 * endpoint on a cron) is probably required rather than optional.
 */
async function recordAndCheckSquareBankFingerprint(
  eventType: 'bank_account.created' | 'bank_account.verified',
  bankAccount: any,
  merchantId: string | undefined
): Promise<void> {
  const hasFingerprint = typeof bankAccount?.fingerprint === 'string' && bankAccount.fingerprint.length > 0;
  console.log(
    `[square-webhook] ${eventType} received for merchant ${merchantId ?? 'unknown'}, bank account ` +
    `${bankAccount?.id ?? 'unknown'} (fingerprint present in payload: ${hasFingerprint}) -- ` +
    `bank-fingerprint fraud-guard integration point (see TODO above), not yet wired to ConnectBankFingerprint.`
  );
}

/**
 * A PENDING idempotency row older than this is treated as a crashed handler, not an in-flight one
 * (2026-09-30, payment review finding 3). Before, PENDING was skipped forever, so a process that died
 * mid-handler (deploy, OOM, timeout) after inserting the row lost that payment event permanently: Square
 * retried, got "in-flight (PENDING) -- skipping", and answered 200. Handlers are idempotent (guarded flips
 * and unique Purchase keys), so re-driving after this window is safe.
 */
export const SQUARE_WEBHOOK_PENDING_STALE_MS = 5 * 60 * 1000;

export type SquareWebhookClaim =
  | { proceed: true; via: 'NEW' | 'FAILED_RETRY' | 'STALE_PENDING_RETRY' | 'CHECK_ERROR' }
  | { proceed: false; reason: 'COMPLETED' | 'IN_FLIGHT' | 'LOST_CLAIM' };

/**
 * INSERT-FIRST claim of a Square webhook event, with atomic re-claim of FAILED and stale-PENDING rows.
 *   - new event: the insert wins, process it
 *   - COMPLETED: duplicate, skip
 *   - FAILED: re-claim with a conditional updateMany (status FAILED -> PENDING); exactly one concurrent
 *     retry gets count 1 and processes, the others skip
 *   - PENDING younger than SQUARE_WEBHOOK_PENDING_STALE_MS: a live handler owns it, skip
 *   - PENDING older than that: re-claim with a conditional updateMany on `status PENDING AND updatedAt < cutoff`
 *     that also moves updatedAt to now. Postgres serializes the UPDATE, so two simultaneous retries cannot
 *     both see count 1: the loser's WHERE no longer matches once the winner's new updatedAt is committed.
 */
export async function claimSquareWebhookEvent(
  idempotencyKey: string,
  label: string,
  // 2026-09-30: the signature-verified event body, stored on the row so the stale-PENDING sweep can re-drive it
  // (jobs/posStrandedSaleReconcileCron.sweepStaleSquareWebhookEvents). Optional so older callers and tests still work.
  payload?: unknown
): Promise<SquareWebhookClaim> {
  try {
    await prisma.processedWebhookEvent.create({
      data: payload === undefined
        ? { eventId: idempotencyKey, status: 'PENDING' }
        : { eventId: idempotencyKey, status: 'PENDING', payload: payload as any },
    });
    return { proceed: true, via: 'NEW' };
  } catch (err: any) {
    if (err?.code !== 'P2002') {
      console.warn(`[square-webhook] Failed to check idempotency for event ${label}:`, err);
      return { proceed: true, via: 'CHECK_ERROR' };
    }
    const existing = await prisma.processedWebhookEvent
      .findUnique({ where: { eventId: idempotencyKey } })
      .catch(() => null);
    if (existing?.status === 'COMPLETED') {
      console.warn(`[square-webhook] Duplicate event ${label} already COMPLETED -- skipping.`);
      return { proceed: false, reason: 'COMPLETED' };
    }
    if (existing?.status === 'FAILED') {
      const claim = await prisma.processedWebhookEvent.updateMany({
        where: { eventId: idempotencyKey, status: 'FAILED' },
        data: { status: 'PENDING', updatedAt: new Date() },
      });
      if (claim.count === 0) {
        console.warn(`[square-webhook] Event ${label} previously FAILED but another retry claimed it first -- skipping.`);
        return { proceed: false, reason: 'LOST_CLAIM' };
      }
      console.warn(`[square-webhook] Event ${label} previously FAILED -- reprocessing.`);
      return { proceed: true, via: 'FAILED_RETRY' };
    }
    const updatedAtMs = existing?.updatedAt instanceof Date ? existing.updatedAt.getTime() : NaN;
    const ageMs = Date.now() - updatedAtMs;
    if (existing?.status === 'PENDING' && Number.isFinite(ageMs) && ageMs >= SQUARE_WEBHOOK_PENDING_STALE_MS) {
      const claim = await prisma.processedWebhookEvent.updateMany({
        where: { eventId: idempotencyKey, status: 'PENDING', updatedAt: { lt: new Date(Date.now() - SQUARE_WEBHOOK_PENDING_STALE_MS) } },
        data: { updatedAt: new Date() },
      });
      if (claim.count === 0) {
        console.warn(`[square-webhook] Event ${label} stale PENDING but another retry claimed it first -- skipping.`);
        return { proceed: false, reason: 'LOST_CLAIM' };
      }
      console.error(`[square-webhook] Event ${label} was left PENDING for ${Math.round(ageMs / 1000)}s (handler likely crashed) -- reprocessing.`);
      try {
        Sentry.captureMessage('[square-webhook] re-driving a stale PENDING webhook event', {
          level: 'warning',
          tags: { area: 'square-webhook-stale-pending' },
          extra: { eventKey: idempotencyKey, ageSeconds: Math.round(ageMs / 1000) },
        } as any);
      } catch {
        // Sentry may not be initialized.
      }
      return { proceed: true, via: 'STALE_PENDING_RETRY' };
    }
    console.warn(`[square-webhook] Event ${label} in-flight (PENDING) -- skipping concurrent reprocess.`);
    return { proceed: false, reason: 'IN_FLIGHT' };
  }
}

/**
 * The per-event dispatch (2026-09-30: extracted from handleSquareWebhook unchanged). Takes an already
 * signature-verified, already-claimed event and runs its handler; a handler throw propagates to the caller. Every
 * handler here is idempotent (guarded flips, unique Purchase keys, dispute step markers), which is what makes it safe
 * for the stale-PENDING sweep to re-drive a stored payload. Exported for that sweep and for tests.
 */
export async function processSquareWebhookEvent(event: SquareWebhookEnvelope): Promise<void> {
  const dataObject = event.data?.object ?? {};

  // Wrap the entire switch so any handler throw marks the idempotency row FAILED (not
  // permanently COMPLETED) and returns 500 -> Square retries with backoff, instead of
  // silently stranding an event (same posture as stripeController.ts's webhookHandler).
  switch (event.type) {
    case 'payment.created':
    case 'payment.updated': {
      const payment = dataObject.payment ?? {};
      await syncSquarePaymentStatus(event.type as 'payment.created' | 'payment.updated', payment, event.merchant_id);
      break;
    }

    case 'refund.updated': {
      const refund = dataObject.refund ?? {};
      await syncSquareRefundStatus(refund);
      break;
    }

    case 'dispute.created':
    case 'dispute.state.updated': {
      // findasale-hacker fix (2026-09-08): call the REAL handler (see import comment above).
      // event's own envelope shape (merchant_id/type/event_id/created_at/data.object.dispute)
      // is field-for-field identical to SquareDisputeWebhookEvent -- no remapping needed.
      await handleSquareDisputeWebhook(event as unknown as SquareDisputeWebhookEvent);
      break;
    }

    case 'bank_account.created':
    case 'bank_account.verified': {
      const bankAccount = dataObject.bank_account ?? {};
      await recordAndCheckSquareBankFingerprint(
        event.type as 'bank_account.created' | 'bank_account.verified',
        bankAccount,
        event.merchant_id
      );
      break;
    }

    case 'payout.paid':
    case 'payout.failed': {
      // Self-contained -- mirrors stripeController.ts's payout.paid/payout.failed handlers
      // (:3916-4010), but simpler: EVERY Square webhook envelope carries merchant_id at the
      // top level (confirmed live via Square's own docs, 2026-09-07), unlike Stripe where
      // payout.paid/failed needed event.account (a Connect-specific quirk) instead of the
      // usual event.data.object shape. Resolve Organizer directly off event.merchant_id ->
      // Organizer.squareMerchantId (Wave 0 schema field).
      const payout = dataObject.payout ?? {};
      const merchantId = event.merchant_id;

      if (!merchantId) {
        console.warn(`[square-webhook] ${event.type} event ${event.event_id} has no merchant_id -- cannot resolve organizer, skipping.`);
        break;
      }

      try {
        const organizer = await prisma.organizer.findFirst({
          where: { squareMerchantId: merchantId },
          select: { id: true, userId: true },
        });

        if (organizer) {
          const currency = payout?.amount_money?.currency_code || payout?.amount_money?.currency || 'USD';
          const amountFormatted = `$${((payout?.amount_money?.amount ?? 0) / 100).toFixed(2)} ${String(currency).toUpperCase()}`;
          const arrival = payout?.arrival_date
            ? new Date(payout.arrival_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : null;

          if (event.type === 'payout.paid') {
            await createNotification({
              userId: organizer.userId,
              type: 'payout_paid',
              title: 'Your payout has landed',
              body: `Your payout of ${amountFormatted} has been sent to your bank account${arrival ? ` (estimated arrival ${arrival})` : ''}.`,
              link: '/organizer/payouts',
              channel: 'OPERATIONAL',
              sendEmail: true,
            }).catch((err) => console.error(`[square-webhook] Failed to create payout_paid notification for organizer ${organizer.id}:`, err));
          } else {
            // payout.failed -- Square's Payout object (per live docs, 2026-09-07) does not
            // document a failure_message/failure_code field the way Stripe's Payout does;
            // only `status` is confirmed present. Generic message until/unless a real
            // failure-reason field is confirmed against a live payload -- flagged in the
            // handoff, not guessed at.
            await createNotification({
              userId: organizer.userId,
              type: 'payout_failed',
              title: 'Your payout failed',
              body: `Your payout of ${amountFormatted} could not be completed. Check your Square Dashboard for details, or contact support.`,
              link: '/organizer/payouts',
              channel: 'OPERATIONAL',
              sendEmail: true,
            }).catch((err) => console.error(`[square-webhook] Failed to create payout_failed notification for organizer ${organizer.id}:`, err));
          }
        } else {
          console.warn(`[square-webhook] ${event.type}: no Organizer found for Square merchant ${merchantId}`);
        }
      } catch (err) {
        console.error(`[square-webhook] Failed to process ${event.type} for merchant ${merchantId}:`, err);
      }
      break;
    }

    default:
      // Billing-only (subscription lifecycle) and every other Square event type are
      // correctly out of scope -- billing stays on Stripe permanently (see the Square
      // scoping doc's Wave 1 #5 section).
      console.log(`[square-webhook] Unhandled event type ${event.type} -- ignoring.`);
      break;
  }
}

/**
 * POST /api/square/webhook
 *
 * Verifies + processes Square webhook events. Mirrors billingController.ts's
 * handleStripeWebhook two-phase (PENDING -> COMPLETED | FAILED) idempotency pattern,
 * reusing the same shared ProcessedWebhookEvent table with a `square:${event_id}` namespace
 * prefix (confirmed live via grep, 2026-09-07: StripeEvent has zero writers anywhere in the
 * backend -- dead table, do not use it).
 *
 * Signature verification uses Square's own WebhooksHelper.verifySignature (from the `square`
 * npm package) rather than hand-rolled HMAC comparison, per CLAUDE.md dispatch instructions.
 */
export const handleSquareWebhook = async (req: Request, res: Response) => {
  let event: SquareWebhookEnvelope | undefined;
  let idempotencyKey = '';

  try {
    const signatureHeader = req.headers['x-square-hmacsha256-signature'] as string | undefined;
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    const notificationUrl = process.env.SQUARE_WEBHOOK_NOTIFICATION_URL;

    if (!signatureKey || !notificationUrl) {
      console.error('[square-webhook] SQUARE_WEBHOOK_SIGNATURE_KEY or SQUARE_WEBHOOK_NOTIFICATION_URL not configured');
      return res.status(500).json({ message: 'Square webhook not configured' });
    }

    if (!signatureHeader) {
      console.warn('[square-webhook] Missing x-square-hmacsha256-signature header -- rejecting.');
      return res.status(400).json({ message: 'Missing signature header' });
    }

    // express.raw() (wired in index.ts, mirrors the Stripe/billing webhook routes) leaves
    // req.body as a Buffer -- WebhooksHelper.verifySignature needs the exact raw string body
    // (it concatenates notificationUrl + requestBody before HMAC'ing -- confirmed via the
    // `square` npm package's own source, wrapper/WebhooksHelper.js).
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');

    let isValid = false;
    try {
      isValid = await WebhooksHelper.verifySignature({
        requestBody: rawBody,
        signatureHeader,
        signatureKey,
        notificationUrl,
      });
    } catch (verifyErr: any) {
      console.error('[square-webhook] Signature verification threw:', verifyErr?.message || verifyErr);
      return res.status(400).json({ message: 'Webhook signature verification failed' });
    }

    if (!isValid) {
      console.warn('[square-webhook] Signature verification failed -- rejecting event.');
      return res.status(400).json({ message: 'Webhook signature verification failed' });
    }

    try {
      event = JSON.parse(rawBody) as SquareWebhookEnvelope;
    } catch (parseErr: any) {
      console.error('[square-webhook] Failed to parse verified webhook body as JSON:', parseErr?.message || parseErr);
      return res.status(400).json({ message: 'Invalid JSON body' });
    }

    if (!event?.event_id || !event?.type) {
      console.warn('[square-webhook] Verified event missing event_id/type -- rejecting.');
      return res.status(400).json({ message: 'Malformed event' });
    }

    // Namespaced idempotency key -- exact same pattern billingController.ts uses for
    // `billing:${event.id}` (billingController.ts:118), applied to Square's `event_id` field
    // (Square's envelope names it event_id, not id, unlike Stripe's Event object).
    idempotencyKey = `square:${event.event_id}`;

    // INSERT-FIRST preserves the P0 concurrent-duplicate race guard (first inserter wins) --
    // same two-phase status idiom as billingController.ts / stripeController.ts. A FAILED row and a
    // PENDING row older than SQUARE_WEBHOOK_PENDING_STALE_MS are re-claimed atomically (see
    // claimSquareWebhookEvent), so a crash mid-handler no longer loses the event.
    const claim = await claimSquareWebhookEvent(idempotencyKey, `${event.event_id} (type: ${event.type})`, event);
    if (!claim.proceed) {
      return res.json({ received: true, duplicate: true });
    }

    console.log(`[square-webhook] Received event ${event.event_id} type=${event.type} merchant=${event.merchant_id ?? 'unknown'}`);

    // Wrap the whole dispatch so any handler throw marks the idempotency row FAILED (not permanently COMPLETED) and
    // returns 500 -> Square retries with backoff, instead of silently stranding an event (same posture as
    // stripeController.ts's webhookHandler). The dispatch itself lives in processSquareWebhookEvent so the stale-PENDING
    // sweep can re-drive a stored payload through exactly the same code.
    await processSquareWebhookEvent(event);

    // Terminal state written only AFTER the switch completed successfully (mirrors
    // billingController.ts:382-385 / stripeController.ts:2686-2689).
    await prisma.processedWebhookEvent.update({
      where: { eventId: idempotencyKey },
      data: { status: 'COMPLETED' },
    }).catch((e) => console.warn(`[square-webhook] Failed to mark event ${event?.event_id} COMPLETED:`, e));

    res.json({ received: true });
  } catch (handlerErr: any) {
    // Mark FAILED so a Square retry is allowed to REPROCESS (fail-open) instead of being
    // short-circuited by a COMPLETED row that was never actually earned (mirrors
    // billingController.ts:387-402 / stripeController.ts's webhookHandler catch).
    if (idempotencyKey) {
      await prisma.processedWebhookEvent.update({
        where: { eventId: idempotencyKey },
        data: { status: 'FAILED' },
      }).catch((e) => console.warn(`[square-webhook] Failed to mark event ${event?.event_id} FAILED:`, e));
    }
    console.error(`[square-webhook] handler threw for event ${event?.event_id} type=${event?.type}`, handlerErr);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Webhook processing failed' });
    }
  }
};
