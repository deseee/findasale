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

/**
 * Wave 2B: Recalculate shopperRating from Review.rating
 * Averages all APPROVED reviews for an organizer's sales
 * Stores result in OrganizerReputation.shopperRating (0–5 scale, null if no reviews)
 */
export async function recalculateShopperRating(organizerId: string): Promise<void> {
  try {
    // Resolve the User ID from the Organizer
    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { userId: true },
    });

    if (!organizer) {
      console.warn(`[reputationService] Organizer not found: ${organizerId}`);
      return;
    }

    // Get all APPROVED reviews for this organizer's sales
    const reviews = await prisma.review.findMany({
      where: {
        sale: { organizerId },
        moderationStatus: 'APPROVED',
      },
      select: { rating: true },
    });

    if (reviews.length === 0) {
      // No reviews yet — clear the field
      await prisma.organizerReputation.updateMany({
        where: { organizerId: organizer.userId },
        data: { shopperRating: null },
      });
      return;
    }

    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    const shopperRating = Math.round(avg * 10) / 10; // round to 1 decimal

    // Update or create the OrganizerReputation record (using User.id, not Organizer.id)
    await prisma.organizerReputation.upsert({
      where: { organizerId: organizer.userId },
      create: {
        organizerId: organizer.userId,
        shopperRating,
      },
      update: {
        shopperRating,
      },
    });

    console.log(
      `[reputationService] shopperRating updated for organizer ${organizerId}: ` +
      `${shopperRating} (${reviews.length} approved reviews)`
    );
  } catch (err) {
    console.error(`[reputationService] Error recalculating shopperRating for ${organizerId}:`, err);
    throw err;
  }
}

/**
 * Feature #71: Calculate and store organizer reputation score in OrganizerReputation model
 * Simplified calculation: saleCount (30% weight) + photoQualityAvg (70% weight)
 *
 * Score formula (0–5 stars):
 *   saleCount_factor = min(saleCount / 10, 1) * 5 * 0.3  (30% of score)
 *   photoQuality_factor = photoQualityAvg * 5 * 0.7      (70% of score)
 *   score = saleCount_factor + photoQuality_factor, capped at 5
 */
export async function calculateOrganizerReputationScore(organizerId: string): Promise<void> {
  try {
    // Find user associated with this organizer
    const user = await prisma.user.findFirst({
      where: { organizer: { id: organizerId } },
      select: { id: true },
    });

    if (!user) {
      console.warn(`[reputationService] User not found for organizer ${organizerId}`);
      return;
    }

    // Fetch all published sales for this organizer with their items
    const sales = await prisma.sale.findMany({
      where: { organizerId, status: 'PUBLISHED' },
      select: {
        id: true,
        items: {
          select: { photoUrls: true },
        },
      },
    });

    const saleCount = sales.length;

    // Calculate average photo quality across all items
    let totalItems = 0;
    let itemsWithPhotos = 0;

    for (const sale of sales) {
      for (const item of sale.items) {
        totalItems++;
        if (item.photoUrls && item.photoUrls.length > 0) {
          itemsWithPhotos++;
        }
      }
    }

    const photoQualityAvg = totalItems > 0 ? itemsWithPhotos / totalItems : 0;

    // Calculate weighted score (0–5)
    const saleCountFactor = Math.min(saleCount / 10, 1) * 5 * 0.3;  // 30% weight
    const photoQualityFactor = photoQualityAvg * 5 * 0.7;             // 70% weight
    const score = Math.min(saleCountFactor + photoQualityFactor, 5);  // Cap at 5

    const isNew = saleCount < 3;

    // Upsert OrganizerReputation record
    await prisma.organizerReputation.upsert({
      where: { organizerId: user.id },
      create: {
        organizerId: user.id,
        score,
        responseTimeAvg: 0, // stub for now
        saleCount,
        photoQualityAvg,
        shopperRating: null,
        disputeRate: 0, // stub for now
        isNew,
        lastCalculated: new Date(),
      },
      update: {
        score,
        responseTimeAvg: 0,
        saleCount,
        photoQualityAvg,
        isNew,
        lastCalculated: new Date(),
      },
    });

    console.log(
      `[reputationService] Reputation for organizer ${organizerId}: score=${score.toFixed(2)}, ` +
      `saleCount=${saleCount}, photoQualityAvg=${(photoQualityAvg * 100).toFixed(0)}%, isNew=${isNew}`
    );
  } catch (err) {
    console.error(`[reputationService] Error calculating reputation for ${organizerId}:`, err);
    throw err;
  }
}

/**
 * Get or update reputation from OrganizerReputation — cached if < 24h old, else recalculates
 */
export async function getOrUpdateOrganizerReputation(organizerId: string) {
  try {
    // Find user associated with this organizer
    const user = await prisma.user.findFirst({
      where: { organizer: { id: organizerId } },
      select: { id: true },
    });

    if (!user) {
      return null;
    }

    // Fetch existing reputation record
    let reputation = await prisma.organizerReputation.findUnique({
      where: { organizerId: user.id },
    });

    // If no reputation record exists, or > 24h old, recalculate
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    if (!reputation || new Date().getTime() - reputation.lastCalculated.getTime() > twentyFourHoursMs) {
      await calculateOrganizerReputationScore(organizerId);
      reputation = await prisma.organizerReputation.findUnique({
        where: { organizerId: user.id },
      });
    }

    return reputation;
  } catch (err) {
    console.error(`[reputationService] Error in getOrUpdateOrganizerReputation for ${organizerId}:`, err);
    throw err;
  }
}
