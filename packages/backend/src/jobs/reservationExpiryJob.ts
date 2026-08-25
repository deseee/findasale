import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { prisma } from '../lib/prisma';
import { createNotification } from '../lib/notificationService';

/**
 * Phase 21: Reservation expiry job.
 * Runs every 30 minutes — finds PENDING/CONFIRMED holds past their expiresAt,
 * marks them EXPIRED, and resets the item status back to AVAILABLE.
 */

export const expireStaleHolds = async (): Promise<void> => {
  try {
    const expired = await prisma.itemReservation.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        expiresAt: { lt: new Date() },
      },
      select: { id: true, itemId: true, userId: true },
    });

    if (expired.length === 0) return;

    const itemIds = expired.map((r) => r.itemId);

    // Notification-gap fix (S1195, 2026-08-08): determine up front which of these items
    // are still actually RESERVED, mirroring the SAME guard the item-revert updateMany
    // below applies. Only a reservation whose item really is being reverted to AVAILABLE
    // here gets a "your hold expired" notification -- a reservation whose item already
    // moved on to some other flow (invoice issued, POS cart, sold) is left untouched by
    // the guarded update below and must not be told something that isn't true.
    const stillReservedItems = itemIds.length > 0
      ? await prisma.item.findMany({
          where: { id: { in: itemIds }, status: 'RESERVED' },
          select: { id: true, title: true },
        })
      : [];
    const stillReservedItemIds = new Set(stillReservedItems.map((i) => i.id));
    const itemTitleById = new Map(stillReservedItems.map((i) => [i.id, i.title]));

    // P0 fix (S-PAYMENT-INVOICE-GAPS-2026-08-25): the item-side guard below (status:
    // 'RESERVED') already protects the Item row from being reverted out from under a
    // paid/in-flight invoice, but the reservation-side update had NO equivalent guard --
    // it unconditionally flipped ANY PENDING/CONFIRMED reservation past its expiresAt to
    // EXPIRED, including one a payment reconcile had JUST correctly flipped to CONFIRMED.
    // Confirmed live: a reservation was correctly set CONFIRMED by markHoldInvoicePaid's
    // STRANDED-PAID reconcile, then flipped back to EXPIRED by this job's very next 10-min
    // run, 8 minutes later. Fix: only expire reservations whose item is still actually
    // RESERVED (stillReservedItemIds, computed above from the same query the item-side
    // guard uses) -- the same "hasn't been touched by any invoice/payment/POS-cart flow
    // since the hold was placed" condition, applied to both sides of this transaction.
    const idsToExpire = expired
      .filter((r) => stillReservedItemIds.has(r.itemId))
      .map((r) => r.id);

    if (idsToExpire.length === 0) return;

    await prisma.$transaction([
      prisma.itemReservation.updateMany({
        where: { id: { in: idsToExpire } },
        data: { status: 'EXPIRED' },
      }),
      // Reclaim-gap fix (2026-08-04): guard added so this unconditional revert can't
      // race ahead of and bypass the Stripe-verified reclaim jobs (invoiceExpiryJob.ts
      // for the HoldInvoice/Checkout-Session path, posStrandedSaleReconcileCron.ts's
      // expiry branch for the CHECKOUT_LINK/Payment-Link path). Both of those jobs
      // derive their own expiry from this SAME ItemReservation.expiresAt field, so
      // without this guard this job could revert a possibly-PAID item straight to
      // AVAILABLE before its payment status is ever checked with Stripe -- a real
      // double-sell exposure, not just a cosmetic race. Only items still simply
      // RESERVED (i.e. no invoice/payment-link/POS-cart flow has touched them since
      // the hold was placed) are reverted here; this mirrors the conditional atomic
      // updateMany pattern used throughout this subsystem (itemSaleGuard.ts,
      // invoiceExpiryJob.ts).
      prisma.item.updateMany({
        where: { id: { in: itemIds }, status: 'RESERVED' },
        data: { status: 'AVAILABLE' },
      }),
    ]);

    // Notify each shopper whose hold actually expired and released the item. This job
    // previously had no notification import at all (confirmed gap, S1195 sweep) -- a
    // shopper's only way to discover their hold was gone was to reopen the item page and
    // notice it was available to someone else, or that they lost the item entirely.
    // Fire-and-forget, same pattern as every other notification call site in this codebase
    // -- must never block or fail this job's core revert logic.
    for (const r of expired) {
      if (!stillReservedItemIds.has(r.itemId)) continue;
      createNotification({
        userId: r.userId,
        type: 'hold_expired',
        title: 'Your hold expired',
        body: `Your hold on "${itemTitleById.get(r.itemId) || 'an item'}" expired and the item is available again.`,
        link: `/items/${r.itemId}`,
        channel: 'OPERATIONAL',
      }).catch((err) => console.error('[reservationExpiryJob] Failed to create hold_expired notification:', err));
    }

    console.log(`[reservationExpiryJob] Expired ${expired.length} hold(s)`);
  } catch (error) {
    console.error('[reservationExpiryJob] Error:', error);
    // This job is the double-sell safety valve other jobs rely on (see comment above) --
    // a silent failure here must not be invisible. Rethrow so cronGuard/Sentry actually
    // sees it instead of reporting a false "OK".
    throw error;
  }
};

// Feature #121: Run every 10 minutes (was 30 min) for faster expiry
cron.schedule('*/10 * * * *', cronGuard({ jobName: 'reservationExpiryJob' }, async () => {
  // Previously called without await: cronGuard's fn() resolved immediately without
  // waiting for expireStaleHolds() to finish, so a rejection here became an unhandled
  // promise rejection instead of ever reaching cronGuard's catch/Sentry capture.
  await expireStaleHolds();
}));
