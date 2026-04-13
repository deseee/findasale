import { prisma } from '../lib/prisma';

/**
 * Feature #17: Bid Bot Detector — Fraud Detection Service
 * Calculates fraud confidence scores based on user bidding patterns
 * and records fraud signals for organizer review
 */

export type FraudSignalType =
  | 'RAPID_BID'
  | 'BID_CANCEL_PATTERN'
  | 'HIGH_CANCELLATION_RATE'
  | 'VELOCITY_SPIKE'
  | 'NEW_ACCOUNT_ACTIVITY';

export interface FraudCheckResult {
  score: number;
  flagged: boolean;
  signals: FraudSignalType[];
}

const FRAUD_THRESHOLD = 30; // Only record signals if score >= 30
const MAX_SCORE = 100;

/**
 * Calculate fraud confidence score for a user on a specific item/sale
 * Queries ItemReservation and hold history to detect suspicious patterns
 *
 * Scoring weights (from ADR):
 * - Rapid Bids (>3 holds on same item in 60s): +40pts
 * - Bid-Cancel Pattern (5+ cycles): +30pts
 * - High Cancellation Rate (>50% in 7d): +20pts
 * - Velocity Spike (>10 holds in 24h): +15pts
 * - New Account (<7 days old) + activity: +10pts
 */
export async function calculateConfidenceScore(
  userId: string,
  itemId: string,
  saleId: string
): Promise<FraudCheckResult> {
  let score = 0;
  const signals: FraudSignalType[] = [];

  try {
    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });

    if (!user) {
      return { score: 0, flagged: false, signals: [] };
    }

    const now = new Date();
    const userAgeMs = now.getTime() - user.createdAt.getTime();
    const userAgeDays = userAgeMs / (1000 * 60 * 60 * 24);
    const isNewAccount = userAgeDays < 7;

    // ========== RAPID_BID: >3 holds on same item in 60s ==========
    const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000);
    const rapidBids = await prisma.itemReservation.count({
      where: {
        userId,
        itemId,
        createdAt: { gte: sixtySecondsAgo },
      },
    });

    if (rapidBids > 3) {
      score += 40;
      signals.push('RAPID_BID');
    }

    // ========== BID_CANCEL_PATTERN: 5+ place+cancel cycles ==========
    const bidCancelCount = await prisma.itemReservation.count({
      where: {
        userId,
        itemId,
        status: 'CANCELLED',
      },
    });

    if (bidCancelCount >= 5) {
      score += 30;
      signals.push('BID_CANCEL_PATTERN');
    }

    // ========== HIGH_CANCELLATION_RATE: >50% cancelled in last 7d ==========
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const allHoldsInWeek = await prisma.itemReservation.count({
      where: {
        userId,
        createdAt: { gte: sevenDaysAgo },
      },
    });

    const cancelledInWeek = await prisma.itemReservation.count({
      where: {
        userId,
        status: 'CANCELLED',
        createdAt: { gte: sevenDaysAgo },
      },
    });

    if (allHoldsInWeek > 0) {
      const cancellationRate = cancelledInWeek / allHoldsInWeek;
      if (cancellationRate > 0.5) {
        score += 20;
        signals.push('HIGH_CANCELLATION_RATE');
      }
    }

    // ========== VELOCITY_SPIKE: >10 holds in 24h ==========
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const holdsInDay = await prisma.itemReservation.count({
      where: {
        userId,
        createdAt: { gte: twentyFourHoursAgo },
      },
    });

    if (holdsInDay > 10) {
      score += 15;
      signals.push('VELOCITY_SPIKE');
    }

    // ========== NEW_ACCOUNT_ACTIVITY: new account + rapid activity ==========
    if (isNewAccount && (rapidBids > 0 || bidCancelCount > 0 || holdsInDay > 5)) {
      score += 10;
      signals.push('NEW_ACCOUNT_ACTIVITY');
    }

    // Cap at 100
    score = Math.min(score, MAX_SCORE);

    return {
      score,
      flagged: score >= FRAUD_THRESHOLD,
      signals,
    };
  } catch (error) {
    console.error('[fraudDetectionService] calculateConfidenceScore error:', error);
    return { score: 0, flagged: false, signals: [] };
  }
}

/**
 * Record a fraud signal in the database if it meets threshold
 * Upserts to avoid duplicates (unique constraint: userId, itemId, signalType)
 */
export async function recordFraudSignal(
  userId: string,
  itemId: string,
  saleId: string,
  signalType: FraudSignalType,
  score: number
): Promise<void> {
  try {
    if (score < FRAUD_THRESHOLD) {
      return; // Don't record if below threshold
    }

    // Only record if signal type was actually triggered
    await prisma.fraudSignal.upsert({
      where: {
        userId_itemId_signalType: {
          userId,
          itemId,
          signalType,
        },
      },
      update: {
        confidenceScore: score,
        detectedAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        userId,
        itemId,
        saleId,
        signalType,
        confidenceScore: score,
        reviewOutcome: 'PENDING',
      },
    });
  } catch (error) {
    console.error('[fraudDetectionService] recordFraudSignal error:', error);
    // Don't throw — fraud recording should never block hold placement
  }
}

/**
 * Check for fraud on a user's action (bid placement, hold, etc.)
 * Calculates confidence score and records signal if score >= 30
 * Fire-and-forget: designed to be called asynchronously without blocking
 */
export async function checkForFraud(
  userId: string,
  itemId: string,
  saleId: string
): Promise<FraudCheckResult> {
  try {
    const result = await calculateConfidenceScore(userId, itemId, saleId);

    if (result.flagged) {
      // Record the highest-confidence signal
      // In a real scenario, we'd record all signals; for simplicity, record one
      if (result.signals.length > 0) {
        const signalType = result.signals[0] as FraudSignalType;
        await recordFraudSignal(userId, itemId, saleId, signalType, result.score);
      }
    }

    return result;
  } catch (error) {
    console.error('[fraudDetectionService] checkForFraud error:', error);
    return { score: 0, flagged: false, signals: [] };
  }
}

/**
 * Get fraud signals for an organizer's sale
 * Filters by minScore and reviewOutcome
 */
export async function getSaleFraudSignals(
  saleId: string,
  minScore: number = 30,
  status?: 'PENDING' | 'DISMISSED' | 'CONFIRMED',
  page: number = 1,
  limit: number = 20
) {
  try {
    const skip = (page - 1) * limit;

    const where: any = {
      saleId,
      confidenceScore: { gte: minScore },
    };

    if (status) {
      where.reviewOutcome = status;
    }

    const [signals, total] = await Promise.all([
      prisma.fraudSignal.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
          item: {
            select: { id: true, title: true },
          },
        },
        orderBy: { confidenceScore: 'desc' },
        skip,
        take: limit,
      }),
      prisma.fraudSignal.count({ where }),
    ]);

    return {
      signals: signals.map(sig => ({
        id: sig.id,
        userId: sig.userId,
        userName: sig.user.name,
        userEmail: sig.user.email,
        itemId: sig.itemId,
        itemTitle: sig.item?.title || null,
        signalType: sig.signalType,
        confidenceScore: sig.confidenceScore,
        detectedAt: sig.detectedAt,
        reviewedAt: sig.reviewedAt,
        reviewOutcome: sig.reviewOutcome,
        notes: sig.notes,
      })),
      total,
      page,
      hasMore: page * limit < total,
    };
  } catch (error) {
    console.error('[fraudDetectionService] getSaleFraudSignals error:', error);
    throw error;
  }
}

/**
 * Review a fraud signal (organizer or admin action)
 */
export async function reviewSignal(
  signalId: string,
  outcome: 'DISMISSED' | 'CONFIRMED',
  notes?: string,
  reviewedByAdminId?: string
): Promise<void> {
  try {
    await prisma.fraudSignal.update({
      where: { id: signalId },
      data: {
        reviewOutcome: outcome,
        reviewedAt: new Date(),
        reviewedByAdminId,
        notes,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('[fraudDetectionService] reviewSignal error:', error);
    throw error;
  }
}
