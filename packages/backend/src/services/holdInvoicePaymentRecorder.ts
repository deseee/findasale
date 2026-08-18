import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { getIO } from '../lib/socket';
import { pushEvent } from '../services/liveFeedService';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService'; // ADR-085 Track B Phase 1 Step 4
import { endEbayListingIfExists } from '../controllers/ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService';
import { transactionalEmailService } from '../lib/transactionalEmailService';
import { shouldUseDirectCharge } from './stripeConnectService'; // Purchase-row backfill (2026-08-09): recompute chargeType at payment-confirmation time, mirrors posPaymentLinkRecorder.ts

/**
 * holdInvoicePaymentRecorder.ts — payments fix (2026-08-03)
 *
 * PROBLEM: HoldInvoice Stripe payments could get stranded PENDING forever. The
 * `charge.succeeded` webhook (stripeController.ts) keys off
 * `paymentIntent.metadata.invoiceId`, but neither createCombinedInvoice
 * (posController.ts) nor markSoldAndCreateInvoice (reservationController.ts) ever
 * backfilled that metadata key onto the PaymentIntent after creating the HoldInvoice
 * row -- the HoldInvoice ID doesn't exist yet when the Stripe Checkout Session is
 * first created. Fix ships in two parts:
 *   1. Both invoice-creation controllers now backfill the PaymentIntent metadata
 *      with `invoiceId` right after the HoldInvoice row is created (non-fatal --
 *      the webhook is the fast path once this lands).
 *   2. This file is the single source of truth for RECORDING a HoldInvoice as paid:
 *      flips HoldInvoice.status, confirms bundled ItemReservations, marks bundled
 *      Items SOLD, fires cross-channel removal hooks, awards shopper XP, emits the
 *      live-feed socket event, and sends confirmation emails. Reused by BOTH the
 *      Stripe `charge.succeeded` webhook handler (fast path -- metadata now present
 *      going forward) AND invoiceExpiryJob's STRANDED-PAID reconciliation branch
 *      (backstop -- catches any invoice whose webhook never fired, including ones
 *      created before this fix shipped), so the two callers can never diverge.
 *      Mirrors posPaymentLinkRecorder.ts's proven fast-path-plus-backstop pattern.
 *
 * Idempotency (two layers, mirrors posPaymentLinkRecorder.ts):
 *   1. Fast-path check outside any transaction: if HoldInvoice.status is already
 *      'PAID', return immediately with no work done.
 *   2. Inside the $transaction, the flip to PAID is a single guarded conditional
 *      UPDATE (WHERE status = 'PENDING') -- flip-first, so a concurrent webhook/
 *      reconcile race that both reach this point can't double-record.
 *
 * Dead-invoice guard (P0, 2026-08-17): the layer-2 guard above used to be
 * `status != 'PAID'`, which let a CANCELLED (releaseInvoice) or EXPIRED
 * (invoiceExpiryJob / charge.failed) invoice flip FORWARD to PAID when a late
 * charge.succeeded arrived -- Stripe captured real money against an invoice whose
 * items were already back on sale, and if any item had been re-sold in the interim
 * the oversold branch below excluded it from Purchase creation, leaving a captured
 * charge with NO Purchase row for refundService.executeVerifiedRefund to key off.
 * PENDING is now the only state that can flip (it is the only legitimately payable
 * state -- all three creation paths write PENDING, CANCELLED/EXPIRED are terminal,
 * REFUNDED only follows PAID), and any payment arriving on a non-PENDING,
 * non-PAID invoice records NOTHING and raises a Sentry alert
 * (reportDeadInvoicePayment) carrying the invoice id, PaymentIntent id, amount and
 * actual status so the charge can be found and refunded by hand. No automatic
 * refund is issued -- that decision is Patrick's, and is not implemented here.
 *
 * Purchase-row backfill (2026-08-09): this function previously flipped HoldInvoice/Item/
 * ItemReservation state but never created a Purchase row, so refundService.ts's
 * executeVerifiedRefund (keys off purchaseId) and stripeController.ts's
 * resolveDisputeContext (keys off Purchase.stripePaymentIntentId) could never find a
 * record for a Hold-to-Pay sale -- refunds were impossible and disputes silently fell
 * through to the platform-absorb branch even with STRIPE_DISPUTE_LIVE_CLAWBACK=true.
 * Fixed by creating one Purchase row per bundled item (mirrors posPaymentLinkRecorder.ts's
 * proven pattern) inside the SAME $transaction as the PAID flip, sourced entirely from
 * data already fetched/verified in this function (holdInvoice, bundledItems, the
 * paymentIntentId parameter). Idempotency mirrors posPaymentLinkRecorder.ts's second
 * layer: the compound partial unique index on (stripePaymentIntentId, itemId) backstops
 * the outer flip-guard above -- a P2002 on create is caught and treated as
 * already-recorded, never thrown. An item that hits InsufficientStockError in the stock
 * loop below (oversold race) is excluded from Purchase creation, matching
 * posPaymentLinkRecorder.ts's oversoldItemIds handling (a real captured payment with no
 * deliverable item is a manual-refund-review case, not a fabricated fulfillment record).
 * HoldInvoice has no persisted chargeType/stripeAccountId column (same gap documented in
 * posPaymentLinkRecorder.ts for POSPaymentLink), so DIRECT-vs-DESTINATION is recomputed
 * here via shouldUseDirectCharge against the sale's organizer -- same known edge case
 * (can only disagree with the original checkout-time decision if Stripe eligibility or
 * the allowlist changed in between) already accepted for the POS Payment Link path.
 */

export interface MarkHoldInvoicePaidOpts {
  source: 'webhook' | 'reconcile';
  chargeId?: string;
  /** Estimated Stripe processing fee, in cents. Defaults to 0 if not supplied. */
  stripeFeeAmountCents?: number;
}

export interface MarkHoldInvoicePaidResult {
  /** true only if THIS call performed the recording (flipped PENDING -> PAID). */
  recorded: boolean;
  /** true if the invoice was already PAID (by this call or a concurrent one). */
  alreadyPaid: boolean;
  /**
   * P0 (2026-08-17): true if a real Stripe payment arrived for an invoice that was NOT
   * payable (CANCELLED / EXPIRED / any non-PENDING, non-PAID state). Nothing was recorded
   * and NO refund was issued -- a Sentry alert was raised for manual review instead.
   * Optional so existing callers (stripeController charge.succeeded, invoiceExpiryJob's
   * reconcile branch) keep compiling unchanged.
   */
  deadInvoice?: boolean;
}

/**
 * P0 (2026-08-17): loud, actionable alert for "Stripe captured money against an invoice
 * that was not payable". Deliberately a captureException (not captureMessage) so it lands
 * as a real issue with a stack, matching stripeController.ts's cart-checkout failure
 * handler. Carries everything needed to FIND the charge in Stripe and refund it by hand:
 * invoice id, PaymentIntent id, amount, and the invoice's actual status.
 *
 * NO automatic refund is issued from here -- moving money autonomously is out of scope and
 * requires Patrick's explicit sign-off (open decision, flagged in the handoff).
 */
function reportDeadInvoicePayment(params: {
  invoiceId: string;
  paymentIntentId: string;
  invoiceStatus: string;
  amountCents: number;
  source: string;
  chargeId?: string;
  saleId?: string | null;
  shopperUserId?: string | null;
  /** 'pre-transaction' = dead on first read; 'flip-race' = went dead between read and flip. */
  detectedAt: 'pre-transaction' | 'flip-race';
}): void {
  const amountDollars = (params.amountCents / 100).toFixed(2);
  const msg =
    `[hold-invoice/${params.source}] DEAD-INVOICE-PAYMENT invoice=${params.invoiceId} ` +
    `status=${params.invoiceStatus} pi=${params.paymentIntentId} amount=$${amountDollars} ` +
    `detectedAt=${params.detectedAt} -- Stripe captured a payment for an invoice that is not ` +
    `PENDING. NO sale was recorded (no items marked SOLD, no Purchase rows) and NO refund was ` +
    `issued automatically. This charge must be reviewed and refunded manually in Stripe.`;
  console.error(msg);
  try {
    Sentry.captureException(new Error(msg), {
      tags: {
        area: 'hold-invoice-dead-payment',
        invoiceStatus: params.invoiceStatus,
        source: params.source,
        detectedAt: params.detectedAt,
      },
      extra: {
        invoiceId: params.invoiceId,
        stripePaymentIntentId: params.paymentIntentId,
        chargeId: params.chargeId ?? null,
        invoiceStatus: params.invoiceStatus,
        amountCents: params.amountCents,
        amountDollars,
        saleId: params.saleId ?? null,
        shopperUserId: params.shopperUserId ?? null,
        detectedAt: params.detectedAt,
      },
    });
  } catch {
    // Sentry may not be initialized -- never let the alert path throw into the webhook
    // handler (a throw there marks the idempotency row FAILED and returns 500, which makes
    // Stripe retry forever). The console.error above is the fallback record.
  }
}

export async function markHoldInvoicePaid(
  invoiceId: string,
  paymentIntentId: string,
  opts: MarkHoldInvoicePaidOpts
): Promise<MarkHoldInvoicePaidResult> {
  const { source, chargeId, stripeFeeAmountCents = 0 } = opts;

  // Fetch the invoice with full context
  const holdInvoice = await prisma.holdInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      shopper: { select: { id: true, email: true, name: true, guildXp: true } },
      organizer: { select: { id: true, email: true, name: true } },
      sale: true,
    },
  });

  if (!holdInvoice) {
    console.error(`[hold-invoice/${source}] Invoice not found: ${invoiceId}`);
    return { recorded: false, alreadyPaid: false };
  }

  const fullySoldOutIds: string[] = [];
  const partialSaleUpdates: { itemId: string; remainingStock: number }[] = [];
  // Purchase-row backfill (2026-08-09): only items that actually sold in the loop below
  // get a Purchase row -- mirrors posPaymentLinkRecorder.ts's sellableItemIds/
  // oversoldItemIds split so a real oversold race never gets a fabricated PAID Purchase.
  const sellableItemIds: string[] = [];

  // Idempotency check (fast path, outside the tx): if already paid, skip.
  // NOTE this stays FIRST and returns before the dead-invoice guard below, so a legitimate
  // duplicate webhook delivery of the same charge.succeeded is still a silent no-op and
  // never raises a Sentry alert.
  if (holdInvoice.status === 'PAID') {
    console.warn(`[hold-invoice/${source}] Invoice ${invoiceId} already paid, skipping duplicate.`);
    return { recorded: false, alreadyPaid: true };
  }

  // P0 DEAD-INVOICE GUARD (2026-08-17) -- money could be captured with no recoverable record.
  // Before this branch, the ONLY state excluded from the flip below was 'PAID', so a
  // CANCELLED invoice (releaseInvoice, reservationController.ts:2205-2208) or an EXPIRED one
  // (invoiceExpiryJob.ts:279, stripeController.ts charge.failed :3311) satisfied
  // `status != 'PAID'` and was flipped FORWARD to PAID by a late charge.succeeded, with the
  // caller in stripeController.ts (:3176) performing no lifecycle check either.
  // Real failure mode: the organizer releases an invoice, its items return to inventory and
  // go back on sale, but the shopper's Stripe Checkout link is still payable -- they pay.
  // The dead invoice flips to PAID, items are marked SOLD and Purchase rows are written. If
  // an item was re-sold in the interim, sellItemUnits throws InsufficientStockError, that
  // item is excluded from Purchase creation (see the sellableItemIdSet filter below), and
  // Stripe has captured money with NO Purchase row at all -- refundService.ts's
  // executeVerifiedRefund keys off purchaseId, so there is nothing to refund against.
  //
  // PENDING is the ONLY legitimately payable state. Verified against every site that writes
  // HoldInvoice.status: all three creation paths write PENDING (posController.ts:664 and
  // :1379, reservationController.ts:1711); PAID is written only here and is handled above;
  // CANCELLED and EXPIRED are terminal (they are exactly holdInvoiceClaim.ts's
  // DEAD_INVOICE_STATUSES); REFUNDED (InvoiceStatus enum, schema.prisma:2753) can only ever
  // follow PAID and is never written to HoldInvoice anywhere in the backend today. The check
  // is written as `!== 'PENDING'` rather than an explicit dead-list so any future enum value
  // fails CLOSED (alert, record nothing) instead of silently becoming payable.
  //
  // NO automatic refund is issued -- see reportDeadInvoicePayment's note.
  if (holdInvoice.status !== 'PENDING') {
    reportDeadInvoicePayment({
      invoiceId,
      paymentIntentId,
      invoiceStatus: holdInvoice.status,
      amountCents: holdInvoice.totalAmount,
      source,
      chargeId,
      saleId: holdInvoice.saleId,
      shopperUserId: holdInvoice.shopperUserId,
      detectedAt: 'pre-transaction',
    });
    return { recorded: false, alreadyPaid: false, deadInvoice: true };
  }

  // Fetch all items and reservations bundled in this invoice
  const bundledItems = await prisma.item.findMany({
    where: { id: { in: holdInvoice.itemIds } },
  });

  const bundledReservations = await prisma.itemReservation.findMany({
    where: { itemId: { in: holdInvoice.itemIds } },
  });
  void bundledReservations; // preserved verbatim from the original charge.succeeded handler (unused there too)

  // LOCKED DECISION #1: Calculate organizer payout (total amount - platform fee - Stripe fee)
  const stripeFeeAmount = stripeFeeAmountCents / 100; // convert from cents
  const organizerPayout = (holdInvoice.totalAmount / 100) - (holdInvoice.platformFeeAmount / 100) - stripeFeeAmount;

  let didRecord = false;
  // P0 (2026-08-17): when the guarded flip below matches zero rows, that no longer means
  // only "a concurrent call already recorded it" -- it can also mean the invoice went
  // CANCELLED/EXPIRED between the read above and the flip. The two outcomes need opposite
  // handling (silent no-op vs. loud alert), so the actual post-flip status is captured here.
  let postFlipStatus: string | null = null;

  // Update invoice status to PAID
  await prisma.$transaction(async (tx) => {
    // Guarded conditional update (not read-then-write): WHERE id = X AND status != 'PAID'
    // is a single UPDATE statement, so Postgres's row lock on the matched row is what
    // actually serializes a concurrent webhook/reconcile race -- the loser's WHERE clause
    // re-evaluates against the winner's committed row once unblocked and matches zero
    // rows. A separate findUnique-then-update pair does NOT get this guarantee under
    // READ COMMITTED (Postgres default, no isolationLevel override here): a plain SELECT
    // takes no lock, so two concurrent transactions can both read status !== 'PAID'
    // before either commits, and an unconditional `update({ where: { id } })` then lets
    // BOTH proceed to double-decrement stock / double-send notifications and emails.
    // Mirrors the guarded-updateMany pattern already used by itemStockService.sellItemUnits
    // and invoiceExpiryJob's own PENDING -> EXPIRED flip.
    //
    // P0 (2026-08-17): the WHERE is `status: 'PENDING'`, not the old `status: { not: 'PAID' }`.
    // The old form let a CANCELLED or EXPIRED invoice flip FORWARD to PAID on a late
    // charge.succeeded -- see the DEAD-INVOICE GUARD above for the full failure mode. This
    // is also the race-safe half of that guard: the pre-transaction check can be stale, but
    // this single conditional UPDATE takes the row lock, so an invoice released a
    // millisecond ago still matches zero rows here.
    const flip = await tx.holdInvoice.updateMany({
      where: { id: invoiceId, status: 'PENDING' },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
        stripeFeeAmount: Math.round(stripeFeeAmount * 100),
      },
    });
    if (flip.count === 0) {
      // Re-read to find out WHY it matched nothing: 'PAID' = benign concurrent recorder
      // (silent no-op, as before); anything else = the invoice died under us and a real
      // payment just landed on it (alert, record nothing). Safe to read here -- the flip's
      // failed WHERE already waited on any competing write's row lock, so this sees the
      // committed winner's value.
      const current = await tx.holdInvoice.findUnique({
        where: { id: invoiceId },
        select: { status: true },
      });
      postFlipStatus = current?.status ?? null;
      return;
    }
    didRecord = true;

    // Update ALL bundled ItemReservations to CONFIRMED
    await tx.itemReservation.updateMany({
      where: { itemId: { in: holdInvoice.itemIds } },
      data: { status: 'CONFIRMED' },
    });

    // Update ALL bundled items to SOLD (LOCKED DECISION #6) -- ADR-085 Track B
    // Phase 1 Step 4: atomic, race-safe stock decrement replaces the old unconditional
    // updateMany. The bundling business decision (#6) is unchanged, only the mechanism.
    for (const bundledItemId of holdInvoice.itemIds) {
      try {
        const { fullySoldOut, remainingStock } = await sellItemUnits(bundledItemId, 1, tx);
        if (fullySoldOut) fullySoldOutIds.push(bundledItemId);
        else partialSaleUpdates.push({ itemId: bundledItemId, remainingStock });
        sellableItemIds.push(bundledItemId);
      } catch (stockErr: any) {
        if (stockErr instanceof InsufficientStockError) {
          // P0 (2026-08-17): this was console.error ONLY -- one line in Railway, no alert.
          // The consequence is money-shaped: this item is excluded from Purchase creation
          // below (sellableItemIdSet), so Stripe has captured payment for an item with no
          // Purchase row, and refundService.ts's executeVerifiedRefund keys off purchaseId
          // -- there is nothing to refund against without manual intervention. That must
          // page, not whisper.
          //
          // Deliberately NOT converted to a throw. The whole webhook switch in
          // stripeController.ts is wrapped in a try/catch (:1094-1097) that marks the
          // idempotency row FAILED and returns 500, which makes Stripe retry with backoff.
          // A throw here would roll back this ENTIRE transaction -- including the PAID flip
          // and the Purchase rows for every OTHER item in the bundle that sold fine -- and
          // every retry would deterministically hit the same oversold item and roll back
          // again, so the invoice would never record at all and Stripe would retry for days.
          // Swallowing preserves the partial record (which is the recoverable state) and the
          // Sentry alert is what makes the shortfall actionable.
          const oversoldMsg =
            `[hold-invoice/${source}] OVERSOLD-RACE invoice=${invoiceId} item=${bundledItemId} ` +
            `pi=${paymentIntentId} -- payment captured but this item could not be sold ` +
            `(${stockErr.message}). No Purchase row will be created for it, so there is no ` +
            `record for executeVerifiedRefund to key off: this charge needs manual review ` +
            `and likely a partial refund in Stripe.`;
          console.error(oversoldMsg);
          try {
            Sentry.captureException(stockErr, {
              tags: { area: 'hold-invoice-oversold-race', source },
              extra: {
                message: oversoldMsg,
                invoiceId,
                itemId: bundledItemId,
                stripePaymentIntentId: paymentIntentId,
                chargeId: chargeId ?? null,
                saleId: holdInvoice.saleId,
                shopperUserId: holdInvoice.shopperUserId,
                invoiceTotalAmountCents: holdInvoice.totalAmount,
              },
            });
          } catch {
            // Sentry may not be initialized -- never let the alert path throw, that would
            // defeat the whole point of not rethrowing above.
          }
        } else {
          throw stockErr;
        }
      }
    }

    // Purchase-row backfill (2026-08-09): create one Purchase row per bundled item that
    // actually sold above, so refundService.ts's executeVerifiedRefund and
    // stripeController.ts's resolveDisputeContext have a record to find for this
    // Hold-to-Pay sale. Every field below is sourced from data already fetched/verified
    // in this function (holdInvoice, bundledItems, the paymentIntentId parameter) -- no
    // re-derivation through a different path that could drift from what actually
    // happened. HoldInvoice has no persisted chargeType/stripeAccountId (see header
    // comment), so DIRECT-vs-DESTINATION is recomputed via the sale's organizer, mirroring
    // posPaymentLinkRecorder.ts's identical gap for POSPaymentLink.
    const sellableItemIdSet = new Set(sellableItemIds);
    const bundledItemPriceSum = bundledItems.reduce((sum, it) => sum + (it.price || 0), 0);
    const invoicePlatformFeeDollars = holdInvoice.platformFeeAmount / 100;

    const saleOrganizerId = holdInvoice.sale?.organizerId ?? null;
    const saleOrganizer = saleOrganizerId
      ? await tx.organizer.findUnique({ where: { id: saleOrganizerId }, select: { stripeConnectId: true } })
      : null;
    const useDirect = saleOrganizerId && saleOrganizer?.stripeConnectId
      ? await shouldUseDirectCharge(saleOrganizerId, saleOrganizer.stripeConnectId)
      : false;

    for (const bundledItem of bundledItems) {
      if (!sellableItemIdSet.has(bundledItem.id)) continue; // oversold race -- no Purchase row, matches posPaymentLinkRecorder.ts
      const itemAmount = bundledItem.price || 0;
      const itemPlatformFeeAmount = bundledItemPriceSum > 0
        ? parseFloat(((itemAmount / bundledItemPriceSum) * invoicePlatformFeeDollars).toFixed(2))
        : 0;
      try {
        await tx.purchase.create({
          data: {
            userId: holdInvoice.shopperUserId,
            itemId: bundledItem.id,
            saleId: holdInvoice.saleId,
            amount: itemAmount,
            platformFeeAmount: itemPlatformFeeAmount,
            // FEE SNAPSHOT (2026-08-17): commission-only — a hold invoice is never an auction
            // lot. commissionRate is null by design: the invoice's fee is prorated across its
            // bundled items by price share, so a per-row rate would be a back-derived guess
            // rather than a rate anything was actually charged at. The AMOUNT is what earnings
            // reporting needs, and it is exact.
            buyerPremiumAmount: 0,
            buyerPremiumRate: 0,
            commissionAmount: itemPlatformFeeAmount,
            commissionRate: null,
            organizerAbsorbedPremium: false,
            status: 'PAID',
            source: 'ONLINE',
            stripePaymentIntentId: paymentIntentId,
            chargeType: useDirect ? 'DIRECT' : 'DESTINATION',
            ...(useDirect && saleOrganizer?.stripeConnectId ? { stripeAccountId: saleOrganizer.stripeConnectId } : {}),
          },
        });
      } catch (purchaseErr: any) {
        // Compound partial unique (stripePaymentIntentId, itemId) backstop -- mirrors
        // posPaymentLinkRecorder.ts: a concurrent webhook/reconcile race that both reach
        // this insert can't double-create a Purchase row for the same item + PaymentIntent.
        if (purchaseErr.code === 'P2002') {
          console.warn(`[hold-invoice/${source}] Purchase already exists for item ${bundledItem.id} on invoice ${invoiceId} — treating as already recorded.`);
        } else {
          throw purchaseErr;
        }
      }
    }

    // Purchase-row backfill (2026-08-09) miscItems/cash-only edge case: createCombinedInvoice
    // (posController.ts) allows an invoice made entirely of request-body `miscItems` with NO
    // bundled Item rows at all (POS combined cart, e.g. a custom/non-inventory line item) --
    // holdInvoice.itemIds is legitimately [] here, not an oversold race (oversold items are
    // already handled by the sellableItemIdSet filter above, which only runs for invoices that
    // DID have bundled items). miscItems content itself is never persisted on HoldInvoice, so
    // it cannot be reconstructed as individual Purchase rows here -- but leaving this class of
    // invoice with ZERO Purchase rows would leave it exactly as unrefundable/undisputable as
    // the bug this fix closes for item-bundled invoices. One aggregate Purchase row
    // (itemId: null -- Purchase.itemId is nullable for exactly this kind of non-inventory sale,
    // same as the existing ALA_CARTE source rows in stripeController.ts) for the invoice's full
    // totalAmount/platformFeeAmount covers it.
    if (holdInvoice.itemIds.length === 0) {
      try {
        await tx.purchase.create({
          data: {
            userId: holdInvoice.shopperUserId,
            itemId: null,
            saleId: holdInvoice.saleId,
            amount: holdInvoice.totalAmount / 100,
            platformFeeAmount: invoicePlatformFeeDollars,
            // FEE SNAPSHOT (2026-08-17): commission-only. This is the whole-invoice aggregate
            // row, so the fee is the invoice's own figure with no proration — but still no
            // single rate behind it (miscItems are priced ad hoc), hence null.
            buyerPremiumAmount: 0,
            buyerPremiumRate: 0,
            commissionAmount: invoicePlatformFeeDollars,
            commissionRate: null,
            organizerAbsorbedPremium: false,
            status: 'PAID',
            source: 'ONLINE',
            stripePaymentIntentId: paymentIntentId,
            chargeType: useDirect ? 'DIRECT' : 'DESTINATION',
            ...(useDirect && saleOrganizer?.stripeConnectId ? { stripeAccountId: saleOrganizer.stripeConnectId } : {}),
          },
        });
      } catch (purchaseErr: any) {
        if (purchaseErr.code === 'P2002') {
          console.warn(`[hold-invoice/${source}] Purchase already exists for invoice ${invoiceId} (no bundled items) — treating as already recorded.`);
        } else {
          throw purchaseErr;
        }
      }
    }

    // LOCKED DECISION #5: Create notifications for shopper and organizer
    const itemListNotif = bundledItems.length > 1
      ? `${bundledItems.length} items`
      : `"${bundledItems[0]?.title}"`;

    await tx.notification.createMany({
      data: [
        {
          userId: holdInvoice.shopperUserId,
          type: 'payment_completed',
          title: 'Payment confirmed',
          body: `Payment confirmed for ${itemListNotif}. The organizer will send shipping/pickup details.`,
          link: `/items/${holdInvoice.itemIds[0]}`,
          channel: 'OPERATIONAL',
        },
        {
          userId: holdInvoice.organizerUserId,
          type: 'payment_received',
          title: 'Payment received',
          body: `Payment of $${organizerPayout.toFixed(2)} received for ${itemListNotif}. Payout pending.`,
          link: `/organizer/sales/${holdInvoice.saleId}`,
          channel: 'OPERATIONAL',
        },
      ],
    });
  });

  if (!didRecord) {
    // P0 (2026-08-17): a zero-count flip is only benign if the invoice is now PAID. If it
    // went CANCELLED/EXPIRED between the read and the flip, a real payment just landed on a
    // dead invoice and nothing was recorded -- same alert as the pre-transaction guard.
    if (postFlipStatus && postFlipStatus !== 'PAID') {
      reportDeadInvoicePayment({
        invoiceId,
        paymentIntentId,
        invoiceStatus: postFlipStatus,
        amountCents: holdInvoice.totalAmount,
        source,
        chargeId,
        saleId: holdInvoice.saleId,
        shopperUserId: holdInvoice.shopperUserId,
        detectedAt: 'flip-race',
      });
      return { recorded: false, alreadyPaid: false, deadInvoice: true };
    }
    // Another path (concurrent webhook/reconcile) already recorded this payment.
    console.warn(`[hold-invoice/${source}] Invoice ${invoiceId} was recorded by a concurrent call, skipping duplicate.`);
    return { recorded: false, alreadyPaid: true };
  }

  // Fire-and-forget: end eBay listings for items now fully sold out (not every
  // bundled item unconditionally -- ADR-085 Track B Phase 1 Step 4)
  setImmediate(() => {
    Promise.allSettled(
      fullySoldOutIds.map((itemId: string) => endEbayListingIfExists(itemId))
    ).catch(() => {});
    Promise.allSettled(
      fullySoldOutIds.map((itemId: string) => markShopifyItemSold(itemId))
    ).catch(() => {});
    Promise.allSettled(
      fullySoldOutIds.map((itemId: string) => notifyFacebookExportedItemSold(itemId))
    ).catch(() => {});
  });

  // ADR-087 Phase 4: partial sales (not fully sold out) — revise eBay listing
  // quantities for any eBay-linked items in this bundle. Fire-and-forget.
  if (partialSaleUpdates.length) {
    setImmediate(() => {
      Promise.allSettled(
        partialSaleUpdates.map(({ itemId, remainingStock }) =>
          syncMarketplaceStock(itemId, { fullySoldOut: false, remainingStock })
        )
      ).catch(() => {});
    });
  }

  // Award XP to shopper (+15 guildXP for payment completion)
  try {
    const { awardXp, XP_AWARDS } = await import('../services/xpService');
    void XP_AWARDS; // preserved verbatim from the original charge.succeeded handler (unused there too)
    await awardXp(holdInvoice.shopperUserId, 'PAYMENT_COMPLETED', 15, {
      saleId: holdInvoice.saleId,
    });
  } catch (err) {
    console.warn(`[hold-invoice/${source}] Failed to award XP:`, err);
  }

  // Emit socket event for live dashboard updates
  try {
    const io = getIO();
    const itemSummary = bundledItems.length > 1
      ? `${bundledItems.length} items`
      : bundledItems[0]?.title;

    pushEvent(io, holdInvoice.saleId, {
      type: 'HOLD_RELEASED',
      itemTitle: itemSummary,
      amount: organizerPayout,
      saleId: holdInvoice.saleId,
      timestamp: new Date(),
    });
  } catch (err) {
    console.warn(`[hold-invoice/${source}] Failed to emit socket event:`, err);
  }

  // Send confirmation emails (fire-and-forget)
  setImmediate(() => {
    const fromEmail = process.env.GMAIL_FROM_EMAIL || process.env.SES_FROM_EMAIL || 'find@outreach.finda.sale';
    const itemList = bundledItems.length > 1
      ? `${bundledItems.length} items from ${holdInvoice.sale!.title}`
      : bundledItems[0]?.title;
    const totalPaid = (holdInvoice.totalAmount / 100).toFixed(2);
    const platformFee = (holdInvoice.platformFeeAmount / 100).toFixed(2);

    // Email to shopper
    transactionalEmailService.emails.send({
      from: fromEmail,
      to: holdInvoice.shopper.email,
      subject: `Payment confirmed for ${itemList}`,
      html: `
        <h2>Payment Confirmed</h2>
        <p>Hi ${holdInvoice.shopper.name},</p>
        <p>Your payment of $${totalPaid} for <strong>${itemList}</strong> has been confirmed.</p>
        <p>The organizer will contact you soon about shipping or pickup details.</p>
        <p style="color: #6b7280; font-size: 14px;">Transaction ID: ${invoiceId.slice(0, 8)}</p>
      `,
    }).catch((err: unknown) => console.warn(`[hold-invoice/${source}] Failed to send shopper email:`, err));

    // Email to organizer
    transactionalEmailService.emails.send({
      from: fromEmail,
      to: holdInvoice.organizer.email,
      subject: `Payment received: ${itemList}`,
      html: `
        <h2>Payment Received</h2>
        <p>Hi ${holdInvoice.organizer.name},</p>
        <p>Payment of $${organizerPayout.toFixed(2)} has been received for <strong>${itemList}</strong>.</p>
        <p>Payout will be transferred to your Stripe Connect account within 1-2 business days.</p>
        <p style="color: #6b7280; font-size: 14px;">Platform fee: $${platformFee} | Stripe fee: $${stripeFeeAmount.toFixed(2)}</p>
      `,
    }).catch((err: unknown) => console.warn(`[hold-invoice/${source}] Failed to send organizer email:`, err));
  });

  console.log(`[hold-invoice/${source}] Payment completed for invoice ${invoiceId} (${bundledItems.length} items): organizer payout $${organizerPayout.toFixed(2)}${chargeId ? ` (charge ${chargeId})` : ''}`);

  return { recorded: true, alreadyPaid: false };
}
