import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { prisma } from '../lib/prisma';

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
      select: { id: true, itemId: true },
    });

    if (expired.length === 0) return;

    const ids = expired.map((r) => r.id);
    const itemIds = expired.map((r) => r.itemId);

    await prisma.$transaction([
      prisma.itemReservation.updateMany({
        where: { id: { in: ids } },
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

    console.log(`[reservationExpiryJob] Expired ${expired.length} hold(s)`);
  } catch (error) {
    console.error('[reservationExpiryJob] Error:', error);
  }
};

// Feature #121: Run every 10 minutes (was 30 min) for faster expiry
cron.schedule('*/10 * * * *', cronGuard({ jobName: 'reservationExpiryJob' }, async () => {
  expireStaleHolds();
}));
