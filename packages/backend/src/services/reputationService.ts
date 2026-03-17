import { prisma } from '../lib/prisma';

export interface ReputationBreakdown {
  holdResponseTime: number;
  saleFrequency: number;
  photoQuality: number;
  disputeRate: number;
}

export interface ReputationScore {
  score: number | null;
  breakdown: ReputationBreakdown;
  badge: 'new' | 'established' | null;
  salesCount: number;
}

/**
 * Compute reputation score for an organizer (0-5 scale, null if < 3 sales)
 *
 * Metrics (each 0-5 scale, then weighted average):
 * 1. Hold Response Time (40% weight):
 *    - Avg hours between hold placed and resolved/cancelled
 *    - Lower is better (fast resolution = 5 stars)
 * 2. Sale Frequency (25% weight):
 *    - Sales per month in last 6 months
 *    - 3+ sales/month = 5 stars
 * 3. Photo Quality (20% weight):
 *    - % of items with at least 1 photo URL
 *    - 90%+ = 5 stars
 * 4. Dispute Rate (15% weight):
 *    - % of holds that ended in CANCELLED status (proxy for problems)
 *    - Lower cancellation rate = 5 stars
 */
export async function computeReputationScore(organizerId: string): Promise<ReputationScore> {
  // Count completed sales (ENDED status)
  const salesCount = await prisma.sale.count({
    where: { organizerId, status: 'ENDED' },
  });

  // If < 3 sales, no score yet
  if (salesCount < 3) {
    return {
      score: null,
      breakdown: { holdResponseTime: 0, saleFrequency: 0, photoQuality: 0, disputeRate: 0 },
      badge: 'new',
      salesCount,
    };
  }

  // ─── METRIC 1: Hold Response Time (avg hours between placed → resolved/cancelled) ───
  const holds = await prisma.itemReservation.findMany({
    where: {
      item: {
        sale: { organizerId },
      },
      status: { in: ['CONFIRMED', 'CANCELLED', 'EXPIRED'] },
    },
    select: {
      createdAt: true,
      updatedAt: true,
      status: true,
    },
  });

  let holdResponseTimeScore = 5; // default best
  if (holds.length > 0) {
    const avgHours = holds.reduce((sum, hold) => {
      const hoursElapsed = (hold.updatedAt.getTime() - hold.createdAt.getTime()) / (1000 * 60 * 60);
      return sum + hoursElapsed;
    }, 0) / holds.length;

    // Scale: 0-2h = 5, 2-8h = 4, 8-24h = 3, 24-48h = 2, 48+ = 1
    if (avgHours <= 2) {
      holdResponseTimeScore = 5;
    } else if (avgHours <= 8) {
      holdResponseTimeScore = 4;
    } else if (avgHours <= 24) {
      holdResponseTimeScore = 3;
    } else if (avgHours <= 48) {
      holdResponseTimeScore = 2;
    } else {
      holdResponseTimeScore = 1;
    }
  } else {
    holdResponseTimeScore = 5; // no holds = no friction
  }

  // ─── METRIC 2: Sale Frequency (sales per month in last 6 months) ───
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const recentSalesCount = await prisma.sale.count({
    where: {
      organizerId,
      status: 'ENDED',
      endDate: { gte: sixMonthsAgo },
    },
  });

  const salesPerMonth = recentSalesCount / 6; // approximate
  let saleFrequencyScore = 1; // default minimum
  if (salesPerMonth >= 3) {
    saleFrequencyScore = 5;
  } else if (salesPerMonth >= 2) {
    saleFrequencyScore = 4;
  } else if (salesPerMonth >= 1) {
    saleFrequencyScore = 3;
  } else if (salesPerMonth >= 0.5) {
    saleFrequencyScore = 2;
  }

  // ─── METRIC 3: Photo Quality (% items with at least 1 photo) ───
  const [totalItems, itemsWithPhotos] = await Promise.all([
    prisma.item.count({
      where: {
        sale: { organizerId, status: 'ENDED' },
      },
    }),
    prisma.item.count({
      where: {
        sale: { organizerId, status: 'ENDED' },
        photoUrls: {
          hasSome: [''], // non-empty array (Prisma array filtering)
        },
      },
    }),
  ]);

  let photoQualityScore = 5; // default best
  if (totalItems > 0) {
    const photoPercentage = (itemsWithPhotos / totalItems) * 100;
    if (photoPercentage >= 90) {
      photoQualityScore = 5;
    } else if (photoPercentage >= 75) {
      photoQualityScore = 4;
    } else if (photoPercentage >= 50) {
      photoQualityScore = 3;
    } else if (photoPercentage >= 25) {
      photoQualityScore = 2;
    } else {
      photoQualityScore = 1;
    }
  }

  // ─── METRIC 4: Dispute Rate (% holds that ended in CANCELLED status) ───
  let disputeRateScore = 5; // default best
  if (holds.length > 0) {
    const cancelledHolds = holds.filter((h) => h.status === 'CANCELLED').length;
    const cancellationRate = (cancelledHolds / holds.length) * 100;

    if (cancellationRate <= 5) {
      disputeRateScore = 5;
    } else if (cancellationRate <= 15) {
      disputeRateScore = 4;
    } else if (cancellationRate <= 30) {
      disputeRateScore = 3;
    } else if (cancellationRate <= 50) {
      disputeRateScore = 2;
    } else {
      disputeRateScore = 1;
    }
  }

  // ─── Weighted Average ───
  const score =
    holdResponseTimeScore * 0.4 +
    saleFrequencyScore * 0.25 +
    photoQualityScore * 0.2 +
    disputeRateScore * 0.15;

  const finalScore = Math.round(score * 10) / 10; // round to 1 decimal

  return {
    score: finalScore,
    breakdown: {
      holdResponseTime: holdResponseTimeScore,
      saleFrequency: saleFrequencyScore,
      photoQuality: photoQualityScore,
      disputeRate: disputeRateScore,
    },
    badge: salesCount >= 3 ? 'established' : 'new',
    salesCount,
  };
}
