import cron from 'node-cron';
import { cronGuard } from '../utils/cronGuard';
import { prisma } from '../lib/prisma';
import { recalculateShopperRating } from '../services/reputationService';

/**
 * Phase 22: Creator Tier Program — weekly reputation recalculation.
 * Runs every Monday at 2:00 AM.
 *
 * Tier criteria:
 *   NEW            — default; fewer than 5 completed sales or avg rating below 4.0
 *   TRUSTED        — 5+ completed sales + avg rating ≥ 4.0
 *   ESTATE_CURATOR — 20+ completed sales + avg rating ≥ 4.5 + 50+ followers
 *
 * Performance (Sentry resource-spike fix): the working set is filtered to real
 * registered organizers only (isUnmanagedListing=false) — scraped directory rows
 * have no real sales/reviews and can never qualify for a tier, so processing them
 * was ~80k rows + ~160k queries of wasted work per run. The filtered set is then
 * paged with skip/take so it never fully materializes in memory. Tier math,
 * thresholds, and writes are unchanged.
 */

const BATCH_SIZE = 100;

export const recalculateOrganizerTiers = async (): Promise<void> => {
  console.log('[reputationJob] Starting weekly tier recalculation...');
  let updated = 0;

  try {
    let skip = 0;

    // Page through real organizers only. Scraped/unmanaged directory rows
    // (isUnmanagedListing=true) cannot qualify for a tier and are excluded.
    // Supported by the [isUnmanagedListing, createdAt] index.
    while (true) {
      const organizers = await prisma.organizer.findMany({
        where: { isUnmanagedListing: false },
        select: {
          id: true,
          reputationTier: true,
          _count: {
            select: {
              followers: true,
            },
          },
        },
        orderBy: { id: 'asc' },
        skip,
        take: BATCH_SIZE,
      });

      if (organizers.length === 0) break;

      for (const organizer of organizers) {
        const [qualifyingSalesCount, reviews] = await Promise.all([
          // A permanent storefront (PUBLISHED + isOngoing) counts as one active sale
          // for reputation, since it never reaches ENDED (Patrick decision S1009).
          prisma.sale.count({
            where: {
              organizerId: organizer.id,
              OR: [
                { status: 'ENDED' },
                { status: 'PUBLISHED', isOngoing: true },
              ],
            },
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
        if (qualifyingSalesCount >= 20 && avgRating >= 4.5 && followerCount >= 50) {
          newTier = 'ESTATE_CURATOR';
        } else if (qualifyingSalesCount >= 5 && avgRating >= 4.0) {
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

        // Wave 2B: Recalculate shopperRating in batch
        await recalculateShopperRating(organizer.id);
      }

      if (organizers.length < BATCH_SIZE) break; // last page
      skip += BATCH_SIZE;
    }

    console.log(`[reputationJob] Done — ${updated} organizer(s) updated.`);
  } catch (err) {
    console.error('[reputationJob] Error during tier recalculation:', err);
  }
};

// Schedule: every Monday at 2:00 AM
cron.schedule('0 2 * * 1', cronGuard({ jobName: 'reputationJob' }, async () => {
  recalculateOrganizerTiers();
}));
