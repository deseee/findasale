import { prisma } from '../lib/prisma';
import { getIO } from '../lib/socket';
import { pushEvent } from '../services/liveFeedService';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService'; // ADR-085 Track B Phase 1 Step 4
import { endEbayListingIfExists } from '../controllers/ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService';
import { transactionalEmailService } from '../lib/transactionalEmailService';

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
 *   2. Inside the $transaction, the row is re-read and the flip to PAID only
 *      proceeds if status !== 'PAID' -- flip-first, so a concurrent webhook/
 *      reconcile race that both reach this point can't double-record.
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

  // Idempotency check (fast path, outside the tx): if already paid, skip.
  if (holdInvoice.status === 'PAID') {
    console.warn(`[hold-invoice/${source}] Invoice ${invoiceId} already paid, skipping duplicate.`);
    return { recorded: false, alreadyPaid: true };
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
    const flip = await tx.holdInvoice.updateMany({
      where: { id: invoiceId, status: { not: 'PAID' } },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
        stripeFeeAmount: Math.round(stripeFeeAmount * 100),
      },
    });
    if (flip.count === 0) {
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
      } catch (stockErr: any) {
        if (stockErr instanceof InsufficientStockError) {
          console.error(`[hold-invoice/${source}] Oversold race on item ${bundledItemId}:`, stockErr.message);
        } else {
          throw stockErr;
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
