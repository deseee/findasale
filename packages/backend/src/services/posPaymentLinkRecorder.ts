import { POSPaymentLink } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getPlatformFeeRate, SubscriptionTier } from '../utils/feeCalculator';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { endEbayListingIfExists } from '../controllers/ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService';
import { createNotification } from '../lib/notificationService';

/**
 * posPaymentLinkRecorder.ts — ADR pos-webhook-idempotency-reconciliation (2026-07-23, S1151)
 *
 * Single source of truth for recording an in-person POS / QR Payment Link sale:
 * marks items sold, creates Purchase rows, updates the POSPaymentLink, and fires the
 * cross-channel removal hooks (eBay / Shopify / Facebook). Reused by BOTH the Stripe
 * `checkout.session.completed` webhook handler AND the stranded-sale reconciliation cron,
 * so the two callers can never diverge.
 *
 * Idempotency (two layers):
 *   1. Inside a $transaction, the row is re-read and recording only proceeds if
 *      status !== 'COMPLETED'; the flip to COMPLETED happens FIRST so a concurrent
 *      webhook/reconciler tx re-reading the row sees COMPLETED and no-ops.
 *   2. Purchase rows key on stripePaymentIntentId `pos_<linkId>` + itemId, protected by
 *      the compound partial unique (stripePaymentIntentId, itemId); a race that reaches
 *      the insert is caught per-item as P2002 and treated as already-recorded.
 */

export interface RecordPosPaymentLinkSaleOpts {
  source: 'webhook' | 'reconcile';
  sessionId?: string;
}

export interface RecordPosPaymentLinkSaleResult {
  /** true only if THIS call performed the recording (flipped ACTIVE -> COMPLETED). */
  recorded: boolean;
  /** true if the link was already COMPLETED when this call ran (idempotent no-op). */
  alreadyCompleted: boolean;
  purchaseIds: string[];
  /**
   * findasale-hacker adversarial pass, 2026-08-06 (Path A/B/C reclaim-fix review):
   * items where Stripe genuinely captured payment for THIS link, but sellItemUnits()
   * threw InsufficientStockError because the item was already sold via a different
   * channel/buyer by the time this call ran (e.g. posStrandedSaleReconcileCron.ts's
   * expiry-reclaim branch reverted this exact item to RESERVED after this link's own
   * expiresAt passed, it was resold to someone else, and THIS link's best-effort Stripe
   * deactivation call then failed -- letting the original buyer complete a real payment
   * on a link with no deliverable item left). Real money was captured; no Purchase row
   * was created for it (see fix below) to avoid a false/duplicate fulfillment record.
   * Needs organizer/admin manual refund review.
   */
  oversoldItemIds: string[];
}

export async function recordPosPaymentLinkSale(
  posPaymentLink: POSPaymentLink,
  opts: RecordPosPaymentLinkSaleOpts
): Promise<RecordPosPaymentLinkSaleResult> {
  const { source } = opts;

  // Fast path — already recorded before we even open a transaction.
  if (posPaymentLink.status === 'COMPLETED') {
    return { recorded: false, alreadyCompleted: true, purchaseIds: [], oversoldItemIds: [] };
  }

  const fullySoldOutIds: string[] = [];
  const partialSaleUpdates: { itemId: string; remainingStock: number }[] = [];
  const oversoldItemIds: string[] = [];
  let purchaseIds: string[] = [];
  let didRecord = false;

  await prisma.$transaction(async (tx) => {
    // Guarded atomic flip: the WHERE clause + UPDATE row lock is what actually
    // serializes a concurrent webhook/reconciler race — a plain SELECT here would not
    // lock the row under READ COMMITTED, letting both transactions read stale status.
    // (Fixed 2026-08-03, findasale-hacker pass — same race class found in
    // holdInvoicePaymentRecorder.ts; this file was the original reference pattern
    // and had the identical findUnique-then-update TOCTOU gap.)
    const flip = await tx.pOSPaymentLink.updateMany({
      where: { id: posPaymentLink.id, status: { not: 'COMPLETED' } },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (flip.count === 0) {
      return; // another path already recorded this sale — lost the race, no-op
    }
    didRecord = true;

    // Safe to re-read now — this tx already won the atomic flip above.
    const fresh = await tx.pOSPaymentLink.findUnique({ where: { id: posPaymentLink.id } });
    if (!fresh) {
      return; // unreachable in practice (we just updated this row), defensive only
    }

    if (fresh.itemIds?.length) {
      // ADR-085 Track B Phase 1 Step 4: atomic, race-safe stock decrement. Collects which
      // items are now fully sold out so the cross-channel removal hooks (fired outside the
      // tx below) only touch those, not every item unconditionally.
      //
      // findasale-hacker fix (2026-08-06, Path A/B/C adversarial pass): sellableItemIds
      // tracks ONLY items where sellItemUnits actually succeeded above. Previously the
      // Purchase-row loop below used fresh.itemIds unconditionally, so an item that threw
      // InsufficientStockError here (Stripe genuinely captured payment for this link, but
      // the item was already sold via a different channel/buyer by the time this ran --
      // the exact double-fulfillment window opened up by the 2026-08-04 reclaim-expiry fix
      // in posStrandedSaleReconcileCron.ts) still got a status:'PAID' Purchase row created
      // for it. That falsely represented the item as fulfilled by this payment (hiding the
      // fact a refund is owed to the original buyer) and, if ever summed, would double-count
      // revenue for one physical unit. Only sellableItemIds get a Purchase row now;
      // oversoldItemIds are surfaced via organizer notification below instead.
      const sellableItemIds: string[] = [];
      for (const posItemId of fresh.itemIds) {
        try {
          const { fullySoldOut, remainingStock } = await sellItemUnits(posItemId, 1, tx);
          if (fullySoldOut) fullySoldOutIds.push(posItemId);
          else partialSaleUpdates.push({ itemId: posItemId, remainingStock });
          sellableItemIds.push(posItemId);
        } catch (stockErr: any) {
          if (stockErr instanceof InsufficientStockError) {
            console.error(`[pos-record/${source}] Oversold race on item ${posItemId} -- Stripe captured payment for link ${fresh.id} but the item was already sold via another channel; NOT creating a PAID Purchase row for it (would misrepresent fulfillment). Flagged for manual refund review:`, stockErr.message);
            oversoldItemIds.push(posItemId);
          } else {
            throw stockErr;
          }
        }
      }

      const items = sellableItemIds.length
        ? await tx.item.findMany({ where: { id: { in: sellableItemIds } } })
        : [];

      // Look up organizer tier for fee calculation.
      const posOrganizerTier = fresh.saleId
        ? (await tx.sale.findUnique({
            where: { id: fresh.saleId },
            select: { organizer: { select: { subscriptionTier: true } } },
          }))?.organizer?.subscriptionTier ?? null
        : null;
      const posFeeRate = getPlatformFeeRate(posOrganizerTier as SubscriptionTier);

      const createdPurchaseIds: string[] = [];
      for (const item of items) {
        try {
          const purchase = await tx.purchase.create({
            data: {
              itemId: item.id,
              saleId: fresh.saleId,
              amount: item.price || 0,
              platformFeeAmount: parseFloat(((item.price || 0) * posFeeRate).toFixed(2)),
              status: 'PAID',
              source: 'POS',
              stripePaymentIntentId: `pos_${fresh.id}`,
            },
          });
          createdPurchaseIds.push(purchase.id);
        } catch (purchaseErr: any) {
          // Compound partial unique (stripePaymentIntentId, itemId) backstop: a
          // webhook/reconciler race that both reach the insert can't double-create.
          if (purchaseErr.code === 'P2002') {
            console.warn(`[pos-record/${source}] Purchase already exists for item ${item.id} on link ${fresh.id} — treating as already recorded.`);
          } else {
            throw purchaseErr;
          }
        }
      }
      purchaseIds = createdPurchaseIds;

      if (createdPurchaseIds.length) {
        await tx.pOSPaymentLink.update({
          where: { id: fresh.id },
          data: { purchaseIds: createdPurchaseIds },
        });
      }
    }
  });

  // Fire-and-forget cross-channel removal hooks — OUTSIDE the tx.
  if (fullySoldOutIds.length) {
    setImmediate(() => {
      Promise.allSettled(fullySoldOutIds.map((itemId) => endEbayListingIfExists(itemId))).catch(() => {});
      Promise.allSettled(fullySoldOutIds.map((itemId) => markShopifyItemSold(itemId))).catch(() => {});
      Promise.allSettled(fullySoldOutIds.map((itemId) => notifyFacebookExportedItemSold(itemId))).catch(() => {});
    });
  }
  // ADR-087 Phase 4: partial sales (not fully sold out) — revise eBay listing quantities.
  if (partialSaleUpdates.length) {
    setImmediate(() => {
      Promise.allSettled(
        partialSaleUpdates.map(({ itemId, remainingStock }) =>
          syncMarketplaceStock(itemId, { fullySoldOut: false, remainingStock })
        )
      ).catch(() => {});
    });
  }

  if (didRecord) {
    console.log(`[pos-record/${source}] Payment link completed: ${posPaymentLink.stripePaymentLinkId} (link ${posPaymentLink.id})`);
  }

  // findasale-hacker fix (2026-08-06): surface oversold/already-sold-elsewhere captures to
  // the organizer so a real Stripe payment with no matching Purchase record never goes
  // unnoticed. Fire-and-forget, non-fatal -- mirrors the pattern used for the cross-channel
  // removal hooks above and the STRANDED-UNRECOVERED / AUTO-RECORDED notifications in
  // posStrandedSaleReconcileCron.ts.
  if (oversoldItemIds.length) {
    setImmediate(async () => {
      try {
        const [organizer, oversoldItems] = await Promise.all([
          prisma.organizer.findUnique({
            where: { id: posPaymentLink.organizerId },
            select: { userId: true },
          }),
          prisma.item.findMany({
            where: { id: { in: oversoldItemIds } },
            select: { id: true, title: true },
          }),
        ]);
        if (!organizer?.userId) {
          console.error(`[pos-record/${source}] Could not resolve organizer for oversold-payment notification, link=${posPaymentLink.id}, items=${oversoldItemIds.join(',')}`);
          return;
        }
        const titles = oversoldItems.map((i) => `"${i.title}"`).join(', ') || oversoldItemIds.join(', ');
        await createNotification({
          userId: organizer.userId,
          type: 'POS_PAYMENT_NEEDS_REFUND_REVIEW',
          title: 'Payment captured for an already-sold item — refund review needed',
          body: `A shopper's payment link for ${titles} was completed at Stripe, but the item had already been sold through another channel by the time FindA.Sale tried to record it. FindA.Sale did NOT record a duplicate sale. Please check your Stripe dashboard for the payment on link ${posPaymentLink.stripePaymentLinkId}${opts.sessionId ? ` (session ${opts.sessionId})` : ''} and issue a refund if appropriate.`,
          link: '/organizer/pos',
          channel: 'OPERATIONAL',
        });
      } catch (notifErr) {
        console.error(`[pos-record/${source}] Failed to send oversold-payment notification for link=${posPaymentLink.id}:`, notifErr);
      }
    });
  }

  return { recorded: didRecord, alreadyCompleted: false, purchaseIds, oversoldItemIds };
}
