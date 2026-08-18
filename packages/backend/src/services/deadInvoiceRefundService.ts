import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { getStripe } from '../utils/stripe';
import { sendRefundConfirmationEmail } from './refundService';
import { createNotification } from '../lib/notificationService';

/**
 * deadInvoiceRefundService.ts -- PART 2: flag-gated automatic refund for money captured
 * against a DEAD HoldInvoice (2026-08-17). DEFAULT OFF.
 *
 * Called only by jobs/deadInvoicePaidSweepJob.ts. With the flag unset this module makes
 * ZERO Stripe calls and ZERO database writes -- it returns immediately -- so the sweep is
 * fully functional as a pure detect-and-alert job with this half disabled.
 *
 *
 * WHY refundService.executeVerifiedRefund CANNOT BE REUSED
 * --------------------------------------------------------
 * It is keyed entirely off a Purchase row: `executeVerifiedRefund(purchaseId, ...)`
 * (refundService.ts:170), whose first act is `prisma.purchase.findUnique({ where: { id:
 * purchaseId } })` (refundService.ts:188) and which throws `RefundError('Purchase not
 * found', 404)` (refundService.ts:213-215) when there is none. It then requires
 * `purchase.status === 'PAID'` (:217), reads `purchase.stripePaymentIntentId` (:221),
 * and performs its TOCTOU claim as a `Purchase` PAID -> REFUNDING compare-and-swap
 * (:263-269).
 *
 * In the dead-invoice case there is NO Purchase row -- that absence is the entire defect.
 * holdInvoicePaymentRecorder.ts creates Purchase rows only inside the PENDING -> PAID
 * flip, and its P0 dead-invoice guard (2026-08-17) explicitly records NOTHING for a
 * non-PENDING invoice. So executeVerifiedRefund is structurally unreachable here: there is
 * no id to pass it. Fabricating a Purchase row purely to satisfy it would be a database
 * workaround -- a fake fulfillment record for a sale that never happened, which would then
 * feed payouts, refund history, dispute resolution and organizer reporting with a lie.
 *
 * WHAT IS REUSED INSTEAD: every safety pattern from that function, applied to HoldInvoice
 * instead of Purchase --
 *   - the compare-and-swap status claim before touching Stripe (refundService.ts:263-269)
 *   - reverting the claim on Stripe failure so a retry is possible (refundService.ts:334-338)
 *   - the deterministic Stripe idempotencyKey (refundService.ts:324)
 *   - Direct-vs-destination call scoping and `refund_application_fee`
 *     (refundService.ts:292-302, :311-328)
 *   - the `STRIPE_REFUND_LIVE_CLAWBACK` gate on reversing an organizer transfer
 *     (refundService.ts:17-18, :294, :320-322) -- read, never redefined
 *   - the buyer-facing confirmation email helper `sendRefundConfirmationEmail`
 *     (refundService.ts:116) is imported and called directly, not re-implemented
 *   - the 30-day refund window (refundService.ts:225-234)
 *
 *
 * THE CLEAN CASE -- every one of these must hold or NOTHING is refunded
 * --------------------------------------------------------------------
 *  1. DEAD_INVOICE_AUTO_REFUND_ENABLED === 'true'. Unset/anything else = alert only.
 *  2. The invoice is still exactly CANCELLED or EXPIRED at claim time (compare-and-swap).
 *  3. The PaymentIntent status is `succeeded` and `amount_refunded` is 0.
 *  4. `amount_received` equals the invoice total exactly -- full amount captured, so a
 *     full refund is the whole obligation. Any mismatch (partial capture, a split
 *     cash/card POS invoice where only part ran through Stripe, a bundle shortfall) is
 *     NOT the clean case and is left for a human.
 *  5. The invoice bills at least one item, and EVERY one of those items is verifiably
 *     unsold to anyone: no item is `status: 'SOLD'`, no item has `stockSold > 0`, no item
 *     has ANY other Purchase row on it, and no OTHER HoldInvoice covering any of those
 *     items is PAID.
 *  6. Stripe itself reports zero existing refunds against the PaymentIntent (live guard read).
 *  7. The invoice died at least DEAD_INVOICE_REFUND_MIN_AGE_MINUTES ago (default 15) and
 *     no more than DEAD_INVOICE_REFUND_MAX_AGE_DAYS ago (default 30).
 *  8. Destination charges additionally require STRIPE_REFUND_LIVE_CLAWBACK === 'true' --
 *     see the money-placement note on `resolveRefundParams` below.
 *
 * PARTIAL / BUNDLE SHORTFALL: not handled, by design. Condition 4 rejects any charge whose
 * captured amount is not exactly the invoice total, and condition 5 rejects any invoice
 * where even one bundled item moved. Those cases alert and stop.
 *
 *
 * IDEMPOTENCY -- three independent layers, any one of which alone prevents a double refund
 * ----------------------------------------------------------------------------------------
 * L1. DURABLE DB CLAIM (survives process restarts). Before calling Stripe, the invoice is
 *     claimed with a conditional `updateMany` WHERE status IN ('CANCELLED','EXPIRED')
 *     -> 'REFUNDED'. Postgres serializes this, so exactly one caller can ever see
 *     count === 1; every concurrent or later caller sees 0 and aborts. Because the
 *     sweep's candidate query selects only CANCELLED/EXPIRED, a REFUNDED invoice is
 *     permanently out of scope on every future run and every future process.
 * L2. STRIPE IDEMPOTENCY KEY. `refunds.create` is sent with
 *     `idempotencyKey: dead-invoice-refund-<invoiceId>`. If the process dies after Stripe
 *     accepted the refund but before the L1 claim was committed (or before we read the
 *     response), a retry within Stripe's 24h idempotency retention returns the SAME refund
 *     object instead of creating a second one.
 * L3. LIVE GUARD READ (durable beyond 24h, and independent of our database entirely).
 *     Immediately before creating the refund, `refunds.list({ payment_intent })` is queried
 *     on the correct account and `amount_refunded` is checked. Any pre-existing refund --
 *     from a prior run, a prior deploy, or a human in the Stripe dashboard -- aborts with
 *     ALREADY_REFUNDED and marks the invoice REFUNDED locally so it stops being swept.
 *
 * Known, accepted failure direction: a crash between the L1 claim and a successful Stripe
 * call leaves an invoice marked REFUNDED with no refund issued. That direction is chosen
 * deliberately -- it fails toward NOT moving money twice. It is not silent: the sweep
 * raises its PAID-DEAD-INVOICE Sentry alert for that invoice on the same pass, before the
 * refund is attempted-and-reported, so the captured charge is always visible for manual
 * handling. The durable fix (a separate refund-state column rather than overloading
 * `status`) is spec'd under SCHEMA NEEDED and deliberately not implemented here.
 */

const stripe = () => getStripe();

/**
 * The gate. DEFAULT OFF -- unset, empty, '1', 'yes' and anything other than the exact
 * string 'true' all mean disabled. Same strict-equality convention as
 * refundService.ts:17-18 (STRIPE_REFUND_LIVE_CLAWBACK) and :27-28
 * (STRIPE_DISPUTE_LIVE_CLAWBACK) -- both money-moving flags, both default off.
 */
export const deadInvoiceAutoRefundEnabled = (): boolean =>
  process.env.DEAD_INVOICE_AUTO_REFUND_ENABLED === 'true';

const MIN_AGE_MINUTES = parseFloat(process.env.DEAD_INVOICE_REFUND_MIN_AGE_MINUTES ?? '15');
const MAX_AGE_DAYS = parseFloat(process.env.DEAD_INVOICE_REFUND_MAX_AGE_DAYS ?? '30');

export interface DeadInvoiceRefundInput {
  invoiceId: string;
  /** The invoice's status as read by the sweep -- 'CANCELLED' or 'EXPIRED'. */
  invoiceStatus: string;
  itemIds: string[];
  saleId: string;
  shopperUserId: string;
  invoiceTotalCents: number;
  paymentIntentId: string;
  chargeAmountReceivedCents: number;
  amountRefundedCents: number;
  paymentIntentStatus: string;
  /** Evidence-derived by the sweep from which account answered, never from config. */
  isDirectCharge: boolean;
  /** Connected account the charge lives on, or null for a platform/destination charge. */
  stripeAccount: string | null;
  /** When the invoice went dead (HoldInvoice.updatedAt). */
  deadSince: Date;
}

export interface DeadInvoiceRefundOutcome {
  /** true once the flag is on and the clean-case checks were actually evaluated. */
  attempted: boolean;
  /** true only if THIS call created a Stripe refund. */
  refunded: boolean;
  /** Machine-readable-ish reason code plus detail. Always populated. */
  reason: string;
  refundId?: string;
}

/** Every refund decision, positive or negative, is logged and Sentry-reported. */
function report(
  level: 'info' | 'warning' | 'error',
  input: DeadInvoiceRefundInput,
  outcome: DeadInvoiceRefundOutcome
): void {
  const amountDollars = (input.chargeAmountReceivedCents / 100).toFixed(2);
  const msg =
    `[deadInvoiceRefund] ${outcome.refunded ? 'REFUND-ISSUED' : 'REFUND-NOT-ISSUED'} ` +
    `invoice=${input.invoiceId} status=${input.invoiceStatus} pi=${input.paymentIntentId} ` +
    `amount=$${amountDollars} account=${input.stripeAccount ?? 'platform'} ` +
    `charge=${input.isDirectCharge ? 'DIRECT' : 'DESTINATION'} ` +
    `refund=${outcome.refundId ?? '(none)'} reason=${outcome.reason}`;

  if (level === 'error') console.error(msg);
  else if (level === 'warning') console.warn(msg);
  else console.log(msg);

  try {
    const ctx = {
      tags: {
        area: 'dead-invoice-auto-refund',
        refunded: String(outcome.refunded),
        chargeType: input.isDirectCharge ? 'DIRECT' : 'DESTINATION',
      },
      extra: {
        invoiceId: input.invoiceId,
        invoiceStatus: input.invoiceStatus,
        saleId: input.saleId,
        shopperUserId: input.shopperUserId,
        itemIds: input.itemIds,
        stripePaymentIntentId: input.paymentIntentId,
        stripeAccount: input.stripeAccount,
        invoiceTotalCents: input.invoiceTotalCents,
        chargeAmountReceivedCents: input.chargeAmountReceivedCents,
        amountRefundedCents: input.amountRefundedCents,
        refundId: outcome.refundId ?? null,
        reason: outcome.reason,
      },
    };
    if (level === 'error') Sentry.captureException(new Error(msg), ctx as any);
    else Sentry.captureMessage(msg, { level, ...(ctx as any) } as any);
  } catch {
    // Sentry may not be initialized -- the console line above is the fallback record.
  }
}

/**
 * Confirm that not one item on this invoice moved to anyone else. Conservative on purpose:
 * ANY signal of movement disqualifies the whole invoice from auto-refund.
 */
async function itemsAreUntouched(
  input: DeadInvoiceRefundInput
): Promise<{ ok: true; titles: string[] } | { ok: false; reason: string }> {
  if (input.itemIds.length === 0) {
    return { ok: false, reason: 'NO_ITEMS (invoice bills no items -- cannot verify resale)' };
  }

  const items = await prisma.item.findMany({
    where: { id: { in: input.itemIds } },
    select: { id: true, title: true, status: true, stockSold: true },
  });

  if (items.length !== input.itemIds.length) {
    return {
      ok: false,
      reason: `ITEM_MISSING (${items.length}/${input.itemIds.length} of the invoiced items still exist)`,
    };
  }

  const sold = items.filter((i) => i.status === 'SOLD' || (i.stockSold ?? 0) > 0);
  if (sold.length > 0) {
    return {
      ok: false,
      reason: `ITEM_SOLD (${sold.map((i) => `${i.id}:${i.status}/stockSold=${i.stockSold ?? 0}`).join(',')}) -- refunding would take money back for goods that changed hands`,
    };
  }

  // Any Purchase row on these items that is not our own PaymentIntent means someone else
  // bought, or is buying, one of them.
  // NOTE the explicit null branch: Prisma's `not` filter silently EXCLUDES NULL rows, so
  // `{ stripePaymentIntentId: { not: pi } }` alone would miss a POS/cash Purchase with a
  // null PaymentIntent -- exactly the row we most need to see here.
  const otherPurchases = await prisma.purchase.findMany({
    where: {
      itemId: { in: input.itemIds },
      status: { in: ['PENDING', 'PAID', 'REFUNDING', 'REFUNDED', 'DISPUTED', 'DISPUTE_LOST'] },
      OR: [
        { stripePaymentIntentId: null },
        { stripePaymentIntentId: { not: input.paymentIntentId } },
      ],
    },
    select: { id: true, itemId: true, status: true },
    take: 5,
  });
  if (otherPurchases.length > 0) {
    return {
      ok: false,
      reason: `ITEM_HAS_OTHER_PURCHASE (${otherPurchases.map((p) => `${p.id}:${p.itemId}:${p.status}`).join(',')})`,
    };
  }

  // And no other invoice for the same items was paid.
  const otherPaidInvoices = await prisma.holdInvoice.findMany({
    where: {
      id: { not: input.invoiceId },
      status: 'PAID',
      itemIds: { hasSome: input.itemIds },
    },
    select: { id: true },
    take: 5,
  });
  if (otherPaidInvoices.length > 0) {
    return {
      ok: false,
      reason: `ITEM_ON_ANOTHER_PAID_INVOICE (${otherPaidInvoices.map((i) => i.id).join(',')})`,
    };
  }

  return { ok: true, titles: items.map((i) => i.title) };
}

/**
 * Stripe call shape + account scoping.
 *
 * DIRECT charge: the charge lives on the connected account, so both the request option
 * `{ stripeAccount }` and `refund_application_fee: true` are mandatory -- Stripe does NOT
 * auto-refund the platform's application fee on a Direct charge, and there is no Transfer
 * object to reverse (refundService.ts:312-317, :326-328).
 *
 * DESTINATION charge: funds were already moved to the organizer by `transfer_data` at
 * capture time, for a sale that was never recorded. Refunding WITHOUT `reverse_transfer`
 * would take the money out of the PLATFORM balance while the organizer keeps proceeds for
 * a phantom sale. Reversing the organizer's transfer is precisely what
 * STRIPE_REFUND_LIVE_CLAWBACK gates (refundService.ts:12-18, :294, :320-322), and that
 * flag is locked and default-off. So on the destination path this service does not invent
 * a second opinion: if the clawback flag is off, it refuses to auto-refund and alerts.
 */
function resolveRefundParams(
  input: DeadInvoiceRefundInput
): { ok: true; params: Record<string, unknown>; options: Record<string, unknown> } | { ok: false; reason: string } {
  if (input.isDirectCharge) {
    if (!input.stripeAccount) {
      return {
        ok: false,
        reason: 'DIRECT_CHARGE_NO_ACCOUNT (charge resolved as Direct but no connected account id -- cannot scope the refund)',
      };
    }
    return {
      ok: true,
      params: { payment_intent: input.paymentIntentId, refund_application_fee: true },
      options: {
        idempotencyKey: `dead-invoice-refund-${input.invoiceId}`,
        stripeAccount: input.stripeAccount,
      },
    };
  }

  if (process.env.STRIPE_REFUND_LIVE_CLAWBACK !== 'true') {
    return {
      ok: false,
      reason:
        'DESTINATION_CLAWBACK_DISABLED (destination charge: refunding without reverse_transfer would leave the platform out of pocket while the organizer keeps proceeds for a sale that never happened. Reversing the organizer transfer is gated by STRIPE_REFUND_LIVE_CLAWBACK, which is off. Manual review.)',
    };
  }

  return {
    ok: true,
    params: {
      payment_intent: input.paymentIntentId,
      reverse_transfer: true,
      refund_application_fee: true,
    },
    options: { idempotencyKey: `dead-invoice-refund-${input.invoiceId}` },
  };
}

/**
 * Attempt a full, idempotent refund for a paid-but-dead invoice. Never throws for a
 * business-rule refusal -- it returns an outcome. Only a genuinely unexpected error
 * propagates, and the sweep catches that too.
 */
export async function attemptDeadInvoiceRefund(
  input: DeadInvoiceRefundInput
): Promise<DeadInvoiceRefundOutcome> {
  if (!deadInvoiceAutoRefundEnabled()) {
    // No Stripe call, no DB write. This is what makes Part 1 standalone.
    return {
      attempted: false,
      refunded: false,
      reason: 'DISABLED (DEAD_INVOICE_AUTO_REFUND_ENABLED is not "true" -- alert-only mode)',
    };
  }

  const fail = (reason: string, level: 'warning' | 'error' = 'warning'): DeadInvoiceRefundOutcome => {
    const outcome: DeadInvoiceRefundOutcome = { attempted: true, refunded: false, reason };
    report(level, input, outcome);
    return outcome;
  };

  // --- Clean-case gate 3: the charge really succeeded and nothing was refunded yet ---
  if (input.paymentIntentStatus !== 'succeeded') {
    return fail(`PI_NOT_SUCCEEDED (status=${input.paymentIntentStatus})`);
  }
  if (input.amountRefundedCents > 0) {
    return fail(`ALREADY_REFUNDED (amount_refunded=${input.amountRefundedCents} on the PaymentIntent)`);
  }

  // --- Clean-case gate 4: full amount only. Any partial/split is a human's problem. ---
  if (input.chargeAmountReceivedCents <= 0) {
    return fail(`NO_AMOUNT_RECEIVED (amount_received=${input.chargeAmountReceivedCents})`);
  }
  if (input.chargeAmountReceivedCents !== input.invoiceTotalCents) {
    return fail(
      `PARTIAL_OR_SPLIT (captured ${input.chargeAmountReceivedCents} != invoice total ${input.invoiceTotalCents} -- partial capture or split cash/card invoice, not the clean case)`
    );
  }

  // --- Clean-case gate 7: age window ---
  const ageMs = Date.now() - input.deadSince.getTime();
  if (ageMs < MIN_AGE_MINUTES * 60 * 1000) {
    return fail(
      `TOO_FRESH (invoice died ${Math.round(ageMs / 1000)}s ago, min ${MIN_AGE_MINUTES}m -- letting the webhook path and any async payment settle first)`
    );
  }
  if (ageMs > MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
    return fail(
      `TOO_OLD (invoice died ${Math.floor(ageMs / 86400000)}d ago, max ${MAX_AGE_DAYS}d -- same window refundService.ts:225-234 enforces)`
    );
  }

  // --- Clean-case gate 5: nothing was sold to anyone else ---
  const untouched = await itemsAreUntouched(input);
  if (!untouched.ok) {
    return fail(untouched.reason);
  }

  // --- Clean-case gate 8: correct Stripe call shape + account scoping ---
  const call = resolveRefundParams(input);
  if (!call.ok) {
    return fail(call.reason);
  }

  // --- Idempotency L3: live guard read against Stripe, on the correct account ---
  try {
    const existing = await stripe().refunds.list(
      { payment_intent: input.paymentIntentId, limit: 1 },
      input.stripeAccount ? { stripeAccount: input.stripeAccount } : undefined
    );
    if (existing.data.length > 0) {
      // Mark it locally so it stops being swept, then report. Conditional so it can never
      // stomp a status that changed underneath us.
      await prisma.holdInvoice.updateMany({
        where: { id: input.invoiceId, status: { in: ['CANCELLED', 'EXPIRED'] } },
        data: { status: 'REFUNDED' },
      });
      return fail(
        `ALREADY_REFUNDED (Stripe already has refund ${existing.data[0].id} on this PaymentIntent -- invoice marked REFUNDED locally, no second refund created)`
      );
    }
  } catch (listErr: any) {
    return fail(`GUARD_READ_FAILED (${listErr?.message ?? listErr}) -- refusing to refund without confirming no refund exists`, 'error');
  }

  // --- Idempotency L1: durable compare-and-swap claim BEFORE any money moves ---
  const originalStatus = input.invoiceStatus;
  const claim = await prisma.holdInvoice.updateMany({
    where: { id: input.invoiceId, status: { in: ['CANCELLED', 'EXPIRED'] } },
    data: { status: 'REFUNDED' },
  });
  if (claim.count !== 1) {
    return fail('CLAIM_LOST (invoice is no longer CANCELLED/EXPIRED -- another run, a webhook, or an organizer action resolved it first)');
  }

  // --- Idempotency L2: deterministic Stripe idempotency key (set in resolveRefundParams) ---
  let refundId: string | undefined;
  try {
    const refund = await stripe().refunds.create(call.params as any, call.options as any);
    refundId = refund.id;
  } catch (stripeErr: any) {
    // Revert the claim so the next run can retry -- refundService.ts:334-338 pattern.
    await prisma.holdInvoice.updateMany({
      where: { id: input.invoiceId, status: 'REFUNDED' },
      data: { status: originalStatus as any },
    });
    return fail(`STRIPE_ERROR (${stripeErr?.message ?? stripeErr}) -- claim reverted to ${originalStatus}, will retry next run`, 'error');
  }

  // Best-effort: record which PaymentIntent this invoice's money came from, so the charge
  // is findable from the invoice row without going back to Stripe. Conditional on the
  // column still being null because HoldInvoice.stripePaymentIntentId is @unique and must
  // never abort the (already completed) refund.
  try {
    await prisma.holdInvoice.updateMany({
      where: { id: input.invoiceId, stripePaymentIntentId: null },
      data: { stripePaymentIntentId: input.paymentIntentId },
    });
  } catch (linkErr) {
    console.warn(`[deadInvoiceRefund] Could not link PaymentIntent ${input.paymentIntentId} to invoice ${input.invoiceId} (non-fatal):`, linkErr);
  }

  const outcome: DeadInvoiceRefundOutcome = {
    attempted: true,
    refunded: true,
    reason: 'CLEAN_CASE (invoice dead, full amount captured, no item sold to anyone, no prior refund)',
    refundId,
  };
  report('info', input, outcome);

  // Tell the shopper. Fire-and-forget and never-throwing: the refund has already succeeded
  // on Stripe and must never be disturbed by a notification failure -- exactly the contract
  // refundService.ts:356-363 uses for its own post-refund side effects.
  try {
    const shopper = await prisma.user.findUnique({
      where: { id: input.shopperUserId },
      select: { email: true, name: true },
    });
    const sale = await prisma.sale.findUnique({
      where: { id: input.saleId },
      select: { organizer: { select: { businessName: true } } },
    });

    sendRefundConfirmationEmail({
      toEmail: shopper?.email,
      buyerName: shopper?.name,
      refundAmount: input.chargeAmountReceivedCents / 100,
      wasCapped: false,
      itemTitle: untouched.titles[0] ?? null,
      organizerBusinessName: sale?.organizer?.businessName ?? null,
    });

    createNotification({
      userId: input.shopperUserId,
      type: 'payment_refunded',
      title: 'Your payment was refunded',
      body: `Your payment of $${(input.chargeAmountReceivedCents / 100).toFixed(2)} went through after the payment window had already closed, so the items were no longer being held for you. We have refunded you in full -- it should appear on your original payment method within 1-2 business days.`,
      link: input.itemIds[0] ? `/items/${input.itemIds[0]}` : undefined,
      channel: 'OPERATIONAL',
      sendEmail: true,
    }).catch((err: unknown) =>
      console.error(`[deadInvoiceRefund] Failed to notify shopper ${input.shopperUserId} for invoice ${input.invoiceId} (non-fatal):`, err)
    );
  } catch (notifyErr) {
    console.error(`[deadInvoiceRefund] Post-refund notification failed for invoice ${input.invoiceId} (non-fatal):`, notifyErr);
  }

  return outcome;
}
