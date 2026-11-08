import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { createNotification } from '../lib/notificationService';
import { fireSquarePurchaseEngagement } from '../services/squarePurchaseEngagementService'; // Wave 2 (2026-09-29): reclaimed-PAID rows earn the same XP, milestones, achievement and Sale Passport stamp as a webhook-settled purchase (shared, idempotent, never throws)
import { getSquareOrderPaymentStatus } from '../services/squareCheckoutLinkService'; // Square reconciliation follow-up (2026-09-09): reuses the shared Orders-API lookup built for posStrandedSaleReconcileCron.ts's Square branch -- see that file's own getSquareOrderPaymentStatus usage.

/**
 * purchaseExpiryJob.ts
 *
 * Fix for a confirmed gap (S1187 audit, exhaustive grep of packages/backend/src/jobs/*.ts):
 * Purchase.status defaults to PENDING and is only ever flipped away from PENDING by the
 * Stripe webhook (payment_intent.succeeded -> PAID across several branches in
 * stripeController.ts, payment_intent.payment_failed -> FAILED). If a buyer abandons
 * checkout before either webhook event ever fires -- closes the tab mid-payment-form,
 * never confirms the PaymentIntent client-side, a webhook delivery is lost -- the
 * Purchase row is PENDING forever. No cron job ever revisits it.
 *
 * Note this job intentionally does NOT touch Item.status or ItemReservation: every
 * checkout path that creates a PENDING Purchase (stripeController.ts createPaymentIntent,
 * bountyController.ts, terminalController.ts) leaves Item.status untouched until the
 * webhook actually confirms payment -- the item remains sellable to someone else in the
 * meantime (first-confirmed-payment-wins, guarded by the existing atomic stock decrement
 * in the webhook handler). So there is no reservation/stock state to revert here; this
 * job's only job is to stop a permanently-PENDING Purchase row from lying about an
 * abandoned or already-resolved payment attempt.
 *
 * STRIPE RETIRED (owner decision 2026-11-04): this job makes no Stripe calls. A historical Stripe row
 * (stripePaymentIntentId set, processor not SQUARE) cannot be verified any more, so it is counted and
 * logged as STRIPE-PENDING-SKIPPED and left for manual review; it is never flipped blindly.
 *
 * Square reconciliation (added 2026-09-09, same-day follow-up to the squarePaymentLinkId/
 * squareOrderId columns landing on Purchase): this job previously logged
 * SQUARE-PENDING-SKIPPED and left every SQUARE-processor PENDING row untouched forever --
 * that gap is now closed. Same evidence-first philosophy, same atomic conditional-updateMany
 * race guard, grouped by squareOrderId instead of PaymentIntent ID, verified via
 * squareCheckoutLinkService.ts's getSquareOrderPaymentStatus() (the same Orders-API lookup
 * posStrandedSaleReconcileCron.ts's Square branch already uses -- no duplicated Square API
 * call logic here). Square's Order.state has only three values (OPEN | COMPLETED | CANCELED):
 *   - COMPLETED (paid: true) -> STRANDED-PAID safety net.
 *     Flip PENDING -> PAID (+ squarePaymentId, mirroring squareWebhookController.ts's own
 *     PAID-flip convention).
 *   - CANCELED             -> Square's one genuine terminal non-paid state, the direct
 *                             state. Flip PENDING -> FAILED.
 *   - OPEN (or unrecognized) -> Square has no richer sub-state than that (no
 *                             requires_payment_method/requires_action equivalent -- a Quick Pay
 *                             link is either still open, paid, or canceled). Left alone,
 *                             re-checked next run.
 * Purchase has no organizerId of its own -- every current Square-checkout-link caller
 * (auctionJob.ts / auctionService.ts) sets Purchase.saleId at creation time, so organizerId is
 * resolved via Sale.organizerId (batch-fetched once per run, not per row).
 *
 * Kill-switch: set PURCHASE_EXPIRY_RECLAIM_DISABLED=1 to make the job early-return
 * (rollback lever, matching the existing convention in invoiceExpiryJob.ts /
 * posStrandedSaleReconcileCron.ts). This kill-switch covers the Square reconciliation added
 * above too -- there is no separate Square-only kill-switch.
 *
 * Threshold: PURCHASE_PENDING_EXPIRY_HOURS (default 2) -- a Purchase row is only a
 * candidate once it has been PENDING for longer than this many hours.
 */

const PENDING_EXPIRY_HOURS = parseFloat(process.env.PURCHASE_PENDING_EXPIRY_HOURS ?? '2');

/**
 * Engagement parity for a stranded-PAID reclaim (Wave 2, 2026-09-29). The webhook that would normally
 * have run the purchase side effects (XP, first-purchase milestones, referral rewards, OG Buyer badge,
 * achievement, Sale Passport MAKE_PURCHASE stamp) was missed, so the reclaim owns them. One call per
 * payment group: the shared service resolves the whole cart from the processor reference (one
 * PaymentIntent or one Square payment shared by N rows), picks the canonical PAID row, and is
 * idempotent on the passport ledger key ACT:MAKE_PURCHASE:<purchaseId> and on PointsTransaction
 * (userId, type, purchaseId), so a later webhook replay or a second sweep can not double-award. Guests
 * (no userId) and POS / test rows are skipped inside the service. Never throws into the job.
 */
export function fireReclaimEngagement(ids: string[], userIds: (string | null)[]): void {
  try {
    const idx = userIds.findIndex((u) => !!u);
    if (idx < 0 || !ids[idx]) return; // guest-only group, nothing to award
    fireSquarePurchaseEngagement(ids[idx]);
  } catch (err) {
    console.warn('[purchaseExpiryJob] could not schedule reclaim engagement (non-fatal):', err);
  }
}

export const reclaimStalePurchases = async (): Promise<void> => {
  if (process.env.PURCHASE_EXPIRY_RECLAIM_DISABLED === '1') {
    console.log('[purchaseExpiryJob] Disabled via PURCHASE_EXPIRY_RECLAIM_DISABLED=1 -- skipping run.');
    return;
  }

  try {
    const cutoff = new Date(Date.now() - PENDING_EXPIRY_HOURS * 60 * 60 * 1000);

    const candidates = await prisma.purchase.findMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
      select: {
        id: true,
        stripePaymentIntentId: true,
        // Square migration Wave S2 #2 (2026-09-09) knock-on fix, now RESOLVED (2026-09-09
        // same-day follow-up): `processor` splits real Stripe anomalies (noPi bucket below)
        // from Square rows (byOrderId/noOrder buckets below). This job now DOES reconcile
        // Square rows directly -- see the Square reconciliation block in the header comment
        // and the byOrderId loop below -- using the squarePaymentLinkId/squareOrderId columns
        // that landed the same day this comment was originally written.
        processor: true,
        saleId: true,
        squareOrderId: true,
        squarePaymentLinkId: true,
        isTestTransaction: true,
        stripeAccountId: true,
        userId: true,
        itemId: true,
        createdAt: true,
      },
    });

    if (candidates.length === 0) return;

    console.log(`[purchaseExpiryJob] Checking ${candidates.length} PENDING Purchase row(s) older than ${PENDING_EXPIRY_HOURS}h.`);

    // Historical Stripe rows: Stripe is retired, so they cannot be verified (counted and logged only).
    const stripePendingPis = new Set<string>();
    const noPi: typeof candidates = [];
    // Square reconciliation (2026-09-09 follow-up): grouped by squareOrderId -- a Square Order
    // is the one thing worth asking the processor about once per candidate set,
    // even though every current Square-checkout-link caller (auctionJob.ts / auctionService.ts)
    // creates exactly one Order per Purchase row today.
    const byOrderId = new Map<string, { ids: string[]; saleId: string | null; userIds: (string | null)[]; itemIds: (string | null)[] }>();
    const noOrder: typeof candidates = [];

    for (const p of candidates) {
      if (p.processor === 'SQUARE') {
        if (!p.squareOrderId) {
          noOrder.push(p);
          continue;
        }
        const orderGroup = byOrderId.get(p.squareOrderId);
        if (orderGroup) {
          orderGroup.ids.push(p.id);
          orderGroup.userIds.push(p.userId);
          orderGroup.itemIds.push(p.itemId);
        } else {
          byOrderId.set(p.squareOrderId, {
            ids: [p.id],
            saleId: p.saleId,
            userIds: [p.userId],
            itemIds: [p.itemId],
          });
        }
        continue;
      }
      if (!p.stripePaymentIntentId) {
        noPi.push(p);
        continue;
      }
      stripePendingPis.add(p.stripePaymentIntentId);
    }

    for (const p of noPi) {
      // No processor reference at all -- nothing to verify against. Log for manual review,
      // mirroring invoiceExpiryJob.ts's NO-SESSION-SKIPPED branch.
      console.warn(`[purchaseExpiryJob] NO-PI-SKIPPED purchase=${p.id} createdAt=${p.createdAt.toISOString()} -- expired PENDING with no stripePaymentIntentId. NOT auto-reverting; needs manual review.`);
    }

    for (const p of noOrder) {
      // A SQUARE-processor row with no squareOrderId shouldn't happen -- every path that sets
      // processor='SQUARE' only does so once createSquareCheckoutLink actually succeeded (see
      // auctionJob.ts / auctionService.ts), and that success path always returns an orderId.
      // Log for manual review rather than silently dropping it, mirroring NO-PI-SKIPPED above.
      console.warn(`[purchaseExpiryJob] NO-ORDER-SKIPPED purchase=${p.id} createdAt=${p.createdAt.toISOString()} -- expired PENDING SQUARE row with no squareOrderId. NOT auto-reverting; needs manual review.`);
    }

    let paidCount = 0;
    let failedCount = 0;
    let inFlightSkipped = 0;

    if (stripePendingPis.size > 0) {
      console.info(`[purchaseExpiryJob] STRIPE-PENDING-SKIPPED -- Stripe is retired, left ${stripePendingPis.size} historical Stripe PaymentIntent group(s) PENDING for manual review (no Stripe API calls).`);
    }

    // Square reconciliation (2026-09-09): evidence-first (ask Square's Orders API for the real
    // state before touching the DB), atomic conditional-updateMany race guard, notification side
    // effects on a stranded-paid find. See the header comment for the full OPEN/COMPLETED/CANCELED state-mapping rationale.
    if (byOrderId.size > 0) {
      // Batch-resolve organizerId once per distinct saleId (Purchase has no organizerId of its
      // own; getSquareOrderPaymentStatus needs the organizer's own Square access token).
      const saleIds = [...new Set([...byOrderId.values()].map((g) => g.saleId).filter((id): id is string => !!id))];
      const sales = saleIds.length > 0
        ? await prisma.sale.findMany({ where: { id: { in: saleIds } }, select: { id: true, organizerId: true } })
        : [];
      const organizerIdBySaleId = new Map(sales.map((s) => [s.id, s.organizerId]));

      for (const [orderId, group] of byOrderId) {
        const organizerId = group.saleId ? organizerIdBySaleId.get(group.saleId) : undefined;
        if (!organizerId) {
          console.warn(`[purchaseExpiryJob] SQUARE-NO-ORGANIZER-SKIPPED order=${orderId} purchaseIds=${group.ids.join(',')} -- could not resolve organizerId from saleId=${group.saleId ?? 'null'}. NOT auto-reverting; needs manual review.`);
          continue;
        }

        try {
          const statusResult = await getSquareOrderPaymentStatus({ organizerId, orderId });
          if (!statusResult.ok) {
            console.error(`[purchaseExpiryJob] SQUARE-STATUS-CHECK-FAILED order=${orderId} purchaseIds=${group.ids.join(',')} -- ${statusResult.code} -- ${statusResult.message}. Will retry next run.`);
            continue;
          }

          if (statusResult.paid) {
            // Square shows the order actually completed -- the payment.updated webhook
            // (squareWebhookController.ts) was missed/delayed. Safety net only: does NOT replay
            // stock-decrement/eBay-sync side effects.
            const result = await prisma.purchase.updateMany({
              where: { squareOrderId: orderId, status: 'PENDING' },
              data: { status: 'PAID', squarePaymentId: statusResult.paymentId ?? null },
            });
            if (result.count > 0) {
              paidCount += result.count;
              fireReclaimEngagement(group.ids, group.userIds);
              const msg = `[purchaseExpiryJob] SQUARE-STRANDED-PAID-RECLAIMED order=${orderId} rows=${result.count} purchaseIds=${group.ids.join(',')} -- Square shows COMPLETED but still PENDING past ${PENDING_EXPIRY_HOURS}h (webhook missed). Flipped to PAID. NOTE: does not replay stock-decrement/eBay-sync side effects -- verify downstream state if this fires often.`;
              console.error(msg);
              try { Sentry.captureMessage(msg, 'error'); } catch { /* Sentry may not be initialized */ }

              const strandedItemIds = [...new Set(group.itemIds.filter((iid): iid is string => !!iid))];
              const itemInfo = strandedItemIds.length > 0
                ? await prisma.item.findMany({
                    where: { id: { in: strandedItemIds } },
                    select: { id: true, title: true, sale: { select: { organizer: { select: { userId: true } } } } },
                  })
                : [];
              const itemInfoById = new Map(itemInfo.map((i) => [i.id, i]));

              const notifiedOrganizers = new Set<string>();
              for (let i = 0; i < group.ids.length; i++) {
                const userId = group.userIds[i];
                const itemId = group.itemIds[i];
                const info = itemId ? itemInfoById.get(itemId) : undefined;
                const itemTitle = info?.title || 'your item';

                if (userId) {
                  createNotification({
                    userId,
                    type: 'purchase_reclaimed_paid',
                    title: 'Payment confirmed',
                    body: `Good news -- your payment for "${itemTitle}" went through. There was a brief delay confirming it, but your purchase is now marked paid.`,
                    link: itemId ? `/items/${itemId}` : undefined,
                    channel: 'OPERATIONAL',
                    sendEmail: true,
                  }).catch((err: unknown) => console.error(`[purchaseExpiryJob] Failed to notify buyer ${userId} for order=${orderId}:`, err));
                }

                const organizerUserId = info?.sale?.organizer?.userId;
                if (organizerUserId && !notifiedOrganizers.has(organizerUserId)) {
                  notifiedOrganizers.add(organizerUserId);
                  createNotification({
                    userId: organizerUserId,
                    type: 'purchase_reclaimed_paid_organizer',
                    title: 'A delayed payment was just confirmed. Please verify your listing.',
                    body: `A payment for "${itemTitle}" was confirmed after a delay in our system. Please double-check this item's stock and any connected marketplace listings (eBay, Facebook, etc.) to make sure they reflect the sale correctly.`,
                    link: itemId ? `/items/${itemId}` : undefined,
                    channel: 'OPERATIONAL',
                    sendEmail: true,
                  }).catch((err: unknown) => console.error(`[purchaseExpiryJob] Failed to notify organizer ${organizerUserId} for order=${orderId}:`, err));
                }
              }
            }
          } else if (statusResult.state === 'CANCELED') {
            const result = await prisma.purchase.updateMany({
              where: { squareOrderId: orderId, status: 'PENDING' },
              data: { status: 'FAILED' },
            });
            if (result.count > 0) {
              failedCount += result.count;
              console.log(`[purchaseExpiryJob] SQUARE-EXPIRED-RECLAIMED order=${orderId} squareState=${statusResult.state} rows=${result.count} purchaseIds=${group.ids.join(',')} -- abandoned past ${PENDING_EXPIRY_HOURS}h. Flipped to FAILED.`);

              for (let i = 0; i < group.ids.length; i++) {
                const userId = group.userIds[i];
                const itemId = group.itemIds[i];
                if (!userId) continue;
                await createNotification({
                  userId,
                  type: 'purchase_expired',
                  title: 'Checkout not completed',
                  body: 'Your checkout was not completed in time, so the payment attempt was cancelled. If you still want this item, you can try again.',
                  link: itemId ? `/items/${itemId}` : undefined,
                  channel: 'OPERATIONAL',
                }).catch(err => console.error(`[purchaseExpiryJob] Failed to notify user ${userId} for order=${orderId}:`, err));
              }
            }
          } else {
            inFlightSkipped += group.ids.length;
            console.log(`[purchaseExpiryJob] SQUARE-IN-FLIGHT-SKIPPED order=${orderId} squareState=${statusResult.state} rows=${group.ids.length} -- not a terminal state yet, retrying next run.`);
          }
        } catch (err: any) {
          console.error(`[purchaseExpiryJob] Failed to reconcile Square order ${orderId} (purchaseIds=${group.ids.join(',')}) -- will retry next run:`, err?.message ?? err);
        }
      }
    }

    console.log(`[purchaseExpiryJob] Reclaimed ${paidCount} PAID (missed webhook), ${failedCount} FAILED (abandoned); ${inFlightSkipped} still in flight; ${noPi.length} NO-PI (needs manual review); ${noOrder.length} SQUARE NO-ORDER (needs manual review).`);
  } catch (error) {
    console.error('[purchaseExpiryJob] Error:', error);
  }
};

// Every 10 minutes, staggered off reservationExpiryJob's */10 pattern (offset :01/:11/...
// avoids the :00/:02/:04/:06 slots already used by reservationExpiryJob/invoiceExpiryJob/
// boothCartAbandonmentSweep/posStrandedSaleReconcile).
cron.schedule('1,11,21,31,41,51 * * * *', cronGuard({ jobName: 'purchaseExpiryJob' }, async () => {
  await reclaimStalePurchases();
}));

console.log(`[purchaseExpiryJob] Registered -- runs every 10 min (offset :01), PURCHASE_PENDING_EXPIRY_HOURS=${PENDING_EXPIRY_HOURS}`);
