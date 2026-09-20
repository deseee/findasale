import cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { prisma } from '../lib/prisma';
import { cronGuard } from '../utils/cronGuard';
import { getStripe, getTestStripe } from '../utils/stripe';
import { createNotification } from '../lib/notificationService';
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
 * Evidence-first Stripe verification (NOT a blind DB-status timeout): asks Stripe
 * directly (paymentIntents.retrieve) what the PaymentIntent's real status is before
 * doing anything, same philosophy as invoiceExpiryJob.ts / posStrandedSaleReconcileCron.ts:
 *   - succeeded            -> STRANDED-PAID safety net: the webhook was missed/delayed.
 *                             Flip PENDING -> PAID (does NOT duplicate the webhook's
 *                             other side effects like stock decrement/eBay sync -- those
 *                             are a separate, narrower gap; flagged in the handoff, not
 *                             silently "fixed" here).
 *   - canceled /
 *     requires_payment_method /
 *     requires_confirmation  -> genuinely abandoned, no forward progress possible.
 *                             Flip PENDING -> FAILED.
 *   - requires_action /
 *     requires_capture /
 *     processing             -> still potentially in flight (3DS pending, manual
 *                             capture pending, payment processing). Left alone,
 *                             re-checked next run.
 *
 * Test transactions (Purchase.isTestTransaction=true, created via getTestStripe() per
 * stripeController.ts's existing convention) are verified against the TEST Stripe key,
 * never the live key.
 *
 * Race safety: the PENDING -> PAID/FAILED flip is an atomic conditional `updateMany`
 * (WHERE status = 'PENDING'), scoped per stripePaymentIntentId so a webhook resolving
 * the same PaymentIntent mid-sweep always wins the race. Purchase.stripePaymentIntentId
 * is NOT unique (one PaymentIntent can back multiple Purchase rows in a multi-item
 * cart/POS sale -- see schema.prisma comment on Purchase.stripePaymentIntentId), so
 * candidates are grouped by PaymentIntent ID and verified against Stripe once per
 * PaymentIntent, then the flip applies to every PENDING row sharing that PaymentIntent.
 *
 * Square reconciliation (added 2026-09-09, same-day follow-up to the squarePaymentLinkId/
 * squareOrderId columns landing on Purchase): this job previously logged
 * SQUARE-PENDING-SKIPPED and left every SQUARE-processor PENDING row untouched forever --
 * that gap is now closed. Same evidence-first philosophy, same atomic conditional-updateMany
 * race guard, grouped by squareOrderId instead of PaymentIntent ID, verified via
 * squareCheckoutLinkService.ts's getSquareOrderPaymentStatus() (the same Orders-API lookup
 * posStrandedSaleReconcileCron.ts's Square branch already uses -- no duplicated Square API
 * call logic here). Square's Order.state has only three values (OPEN | COMPLETED | CANCELED):
 *   - COMPLETED (paid: true) -> STRANDED-PAID safety net, same as Stripe's `succeeded`.
 *     Flip PENDING -> PAID (+ squarePaymentId, mirroring squareWebhookController.ts's own
 *     PAID-flip convention).
 *   - CANCELED             -> Square's one genuine terminal non-paid state, the direct
 *                             equivalent of Stripe's ABANDONED_STATUSES. Flip PENDING -> FAILED.
 *   - OPEN (or unrecognized) -> Square has no richer sub-state than that (no
 *                             requires_payment_method/requires_action equivalent -- a Quick Pay
 *                             link is either still open, paid, or canceled). Left alone,
 *                             re-checked next run, same posture as Stripe's IN_FLIGHT_STATUSES.
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

const ABANDONED_STATUSES = new Set(['canceled', 'requires_payment_method', 'requires_confirmation']);
const IN_FLIGHT_STATUSES = new Set(['requires_action', 'requires_capture', 'processing']);

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

    // Group by PaymentIntent ID (not unique on Purchase -- multi-item carts / POS sales
    // can share one PI across several Purchase rows) so each PI is verified against
    // Stripe exactly once.
    const byPi = new Map<string, { ids: string[]; isTestTransaction: boolean; stripeAccountId: string | null; userIds: (string | null)[]; itemIds: (string | null)[] }>();
    const noPi: typeof candidates = [];
    // Square reconciliation (2026-09-09 follow-up): grouped by squareOrderId, mirroring byPi's
    // grouping-by-PaymentIntent-ID pattern exactly -- a Square Order (like a Stripe
    // PaymentIntent) is the one thing worth asking the processor about once per candidate set,
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
      const group = byPi.get(p.stripePaymentIntentId);
      if (group) {
        if (p.stripeAccountId && group.stripeAccountId && p.stripeAccountId !== group.stripeAccountId) {
          // Data anomaly: two Purchase rows sharing one PaymentIntent should always agree on
          // which connected account it lives on. Don't silently pick one -- surface it.
          console.warn(`[purchaseExpiryJob] STRIPE-ACCOUNT-MISMATCH pi=${p.stripePaymentIntentId} purchase=${p.id} stripeAccountId=${p.stripeAccountId} != group stripeAccountId=${group.stripeAccountId} -- keeping the first-seen value.`);
        }
        group.ids.push(p.id);
        group.userIds.push(p.userId);
        group.itemIds.push(p.itemId);
      } else {
        byPi.set(p.stripePaymentIntentId, {
          ids: [p.id],
          isTestTransaction: p.isTestTransaction,
          stripeAccountId: p.stripeAccountId,
          userIds: [p.userId],
          itemIds: [p.itemId],
        });
      }
    }

    for (const p of noPi) {
      // No PaymentIntent at all -- no Stripe ground truth to verify against (should be
      // rare; every checkout path creates the PI before the Purchase row). Log for
      // manual review, mirroring invoiceExpiryJob.ts's NO-SESSION-SKIPPED branch.
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

    for (const [piId, group] of byPi) {
      try {
        const stripeClient = group.isTestTransaction ? getTestStripe() : getStripe();
        // Direct-Charge purchases live on the organizer's own connected Stripe account, not
        // the platform account -- retrieving without { stripeAccount } always 404s for those
        // even though the PaymentIntent is completely real (same failure mode already fixed
        // once for charges.retrieve() in stripeController.ts's resolveDisputeContext).
        // DESTINATION-charge / platform-level rows (ALA_CARTE, etc.) have no stripeAccountId
        // and keep behaving exactly as before (no stripeAccount option).
        const retrieveOpts = group.stripeAccountId ? { stripeAccount: group.stripeAccountId } : undefined;
        const paymentIntent = await stripeClient.paymentIntents.retrieve(piId, retrieveOpts);

        if (paymentIntent.status === 'succeeded') {
          // Stripe shows the payment actually succeeded -- the webhook was
          // missed/delayed. Safety net only: flip every still-PENDING Purchase row
          // sharing this PI to PAID. Atomic conditional guard so a webhook resolving
          // mid-sweep always wins the race.
          const result = await prisma.purchase.updateMany({
            where: { stripePaymentIntentId: piId, status: 'PENDING' },
            data: { status: 'PAID' },
          });
          if (result.count > 0) {
            paidCount += result.count;
            const msg = `[purchaseExpiryJob] STRANDED-PAID-RECLAIMED pi=${piId} rows=${result.count} purchaseIds=${group.ids.join(',')} -- Stripe shows succeeded but still PENDING past ${PENDING_EXPIRY_HOURS}h (webhook missed). Flipped to PAID. NOTE: does not replay stock-decrement/eBay-sync side effects -- verify downstream state if this fires often.`;
            console.error(msg);
            try { Sentry.captureMessage(msg, 'error'); } catch { /* Sentry may not be initialized */ }

            // Notification-gap fix (S1195 sweep continuation, 2026-08-08): this branch
            // previously only Sentry-captured -- a real person paid successfully and
            // nobody was told. Two audiences, two different reasons:
            //  - Buyer: their payment DID succeed (this flip IS the proof) -- they need
            //    to know it went through instead of wondering if they were charged.
            //  - Organizer: this reclaim explicitly does NOT replay stock-decrement/
            //    eBay-sync side effects (see msg above) -- their inventory may now be
            //    silently wrong until they manually check, so they get a distinct,
            //    more actionable message than the buyer.
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
                }).catch((err: unknown) => console.error(`[purchaseExpiryJob] Failed to notify buyer ${userId} for pi=${piId}:`, err));
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
                }).catch((err: unknown) => console.error(`[purchaseExpiryJob] Failed to notify organizer ${organizerUserId} for pi=${piId}:`, err));
              }
            }
          }
        } else if (ABANDONED_STATUSES.has(paymentIntent.status)) {
          const result = await prisma.purchase.updateMany({
            where: { stripePaymentIntentId: piId, status: 'PENDING' },
            data: { status: 'FAILED' },
          });
          if (result.count > 0) {
            failedCount += result.count;
            console.log(`[purchaseExpiryJob] EXPIRED-RECLAIMED pi=${piId} stripeStatus=${paymentIntent.status} rows=${result.count} purchaseIds=${group.ids.join(',')} -- abandoned past ${PENDING_EXPIRY_HOURS}h. Flipped to FAILED.`);

            // Best-effort buyer notification (authenticated buyers only -- guests have
            // no userId to notify).
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
              }).catch(err => console.error(`[purchaseExpiryJob] Failed to notify user ${userId} for pi=${piId}:`, err));
            }
          }
        } else if (IN_FLIGHT_STATUSES.has(paymentIntent.status)) {
          inFlightSkipped += group.ids.length;
          console.log(`[purchaseExpiryJob] IN-FLIGHT-SKIPPED pi=${piId} stripeStatus=${paymentIntent.status} rows=${group.ids.length} -- not a terminal state yet, retrying next run.`);
        } else {
          console.log(`[purchaseExpiryJob] UNRECOGNIZED-STATUS-SKIPPED pi=${piId} stripeStatus=${paymentIntent.status} rows=${group.ids.length} -- leaving PENDING, retrying next run.`);
        }
      } catch (err: any) {
        console.error(`[purchaseExpiryJob] Failed to reclaim PaymentIntent ${piId} (purchaseIds=${group.ids.join(',')}) -- will retry next run:`, err?.message ?? err);
      }
    }

    // Square reconciliation (2026-09-09): mirrors the byPi loop above -- evidence-first (ask
    // Square's Orders API for the real state before touching the DB), same atomic
    // conditional-updateMany race guard, same notification side effects on a stranded-paid
    // find. See the header comment for the full OPEN/COMPLETED/CANCELED state-mapping rationale.
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
            // (squareWebhookController.ts) was missed/delayed. Safety net only, same posture
            // as the Stripe `succeeded` branch above: does NOT replay stock-decrement/eBay-sync
            // side effects.
            const result = await prisma.purchase.updateMany({
              where: { squareOrderId: orderId, status: 'PENDING' },
              data: { status: 'PAID', squarePaymentId: statusResult.paymentId ?? null },
            });
            if (result.count > 0) {
              paidCount += result.count;
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
