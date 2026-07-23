import { POSPaymentLink } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getPlatformFeeRate, SubscriptionTier } from '../utils/feeCalculator';
import { sellItemUnits, InsufficientStockError } from '../services/itemStockService';
import { endEbayListingIfExists } from '../controllers/ebayController';
import { markShopifyItemSold } from '../services/shopifyService';
import { notifyFacebookExportedItemSold } from '../services/facebookNudgeService';
import { syncMarketplaceStock } from '../services/marketplaceStockSyncService';

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
}

export async function recordPosPaymentLinkSale(
  posPaymentLink: POSPaymentLink,
  opts: RecordPosPaymentLinkSaleOpts
): Promise<RecordPosPaymentLinkSaleResult> {
  const { source } = opts;

  // Fast path — already recorded before we even open a transaction.
  if (posPaymentLink.status === 'COMPLETED') {
    return { recorded: false, alreadyCompleted: true, purchaseIds: [] };
  }

  const fullySoldOutIds: string[] = [];
  const partialSaleUpdates: { itemId: string; remainingStock: number }[] = [];
  let purchaseIds: string[] = [];
  let didRecord = false;

  await prisma.$transaction(async (tx) => {
    // Re-read INSIDE the tx so only one of a webhook/reconciler race proceeds.
    const fresh = await tx.pOSPaymentLink.findUnique({ where: { id: posPaymentLink.id } });
    if (!fresh || fresh.status === 'COMPLETED') {
      return; // another path already recorded this sale
    }

    // Flip to COMPLETED FIRST — a concurrent tx re-reading the row now sees COMPLETED.
    await tx.pOSPaymentLink.update({
      where: { id: fresh.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    didRecord = true;

    if (fresh.itemIds?.length) {
      // ADR-085 Track B Phase 1 Step 4: atomic, race-safe stock decrement. Collects which
      // items are now fully sold out so the cross-channel removal hooks (fired outside the
      // tx below) only touch those, not every item unconditionally.
      for (const posItemId of fresh.itemIds) {
        try {
          const { fullySoldOut, remainingStock } = await sellItemUnits(posItemId, 1, tx);
          if (fullySoldOut) fullySoldOutIds.push(posItemId);
          else partialSaleUpdates.push({ itemId: posItemId, remainingStock });
        } catch (stockErr: any) {
          if (stockErr instanceof InsufficientStockError) {
            console.error(`[pos-record/${source}] Oversold race on item ${posItemId}:`, stockErr.message);
          } else {
            throw stockErr;
          }
        }
      }

      const items = await tx.item.findMany({ where: { id: { in: fresh.itemIds } } });

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

  return { recorded: didRecord, alreadyCompleted: false, purchaseIds };
}
