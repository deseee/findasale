import cron from 'node-cron';
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
      prisma.item.updateMany({
        where: { id: { in: itemIds } },
        data: { status: 'AVAILABLE' },
      }),
    ]);

    console.log(`[reservationExpiryJob] Expired ${expired.length} hold(s)`);
  } catch (error) {
    console.error('[reservationExpiryJob] Error:', error);
  }
};

// Feature #121: Run every 10 minutes (was 30 min) for faster expiry
cron.schedule('*/10 * * * *', () => {
  expireStaleHolds();
});
