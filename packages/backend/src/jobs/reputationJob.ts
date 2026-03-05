import cron from 'node-cron';
import { prisma } from '../lib/prisma';

/**
 * Phase 22: Creator Tier Program — weekly reputation recalculation.
 * Runs every Monday at 2:00 AM.
 *
 * Tier criteria:
 *   NEW            — default; fewer than 5 completed sales or avg rating below 4.0
 *   TRUSTED        — 5+ completed sales + avg rating ≥ 4.0
 *   ESTATE_CURATOR — 20+ completed sales + avg rating ≥ 4.5 + 50+ followers
 */

export const recalculateOrganizerTiers = async (): Promise<void> => {
  console.log('[reputationJob] Starting weekly tier recalculation...');
  let updated = 0;

  try {
    const organizers = await prisma.organizer.findMany({
      select: {
        id: true,
        reputationTier: true,
        _count: {
          select: {
            followers: true,
          },
        },
      },
    });

    for (const organizer of organizers) {
      const [endedSalesCount, reviews] = await Promise.all([
        prisma.sale.count({
          where: { organizerId: organizer.id, status: 'ENDED' },
        }),
        prisma.review.findMany({
          where: { sale: { organizerId: organizer.id } },
          select: { rating: true },
        }),
      ]);

      const followerCount = organizer._count.followers;
      const avgRating =
        reviews.length > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0;

      let newTier: string;
      if (endedSalesCount >= 20 && avgRating >= 4.5 && followerCount >= 50) {
        newTier = 'ESTATE_CURATOR';
      } else if (endedSalesCount >= 5 && avgRating >= 4.0) {
        newTier = 'TRUSTED';
      } else {
        newTier = 'NEW';
      }

      if (newTier !== organizer.reputationTier) {
        await prisma.organizer.update({
          where: { id: organizer.id },
          data: { reputationTier: newTier },
        });
        updated++;
      }
    }

    console.log(`[reputationJob] Done — ${updated} organizer(s) updated.`);
  } catch (err) {
    console.error('[reputationJob] Error during tier recalculation:', err);
  }
};

// Schedule: every Monday at 2:00 AM
cron.schedule('0 2 * * 1', () => {
  recalculateOrganizerTiers();
});
