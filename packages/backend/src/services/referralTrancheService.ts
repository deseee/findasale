import { prisma } from '../lib/prisma';
import { awardXp, XP_AWARDS } from './xpService';
import { ReferralTranche } from '@prisma/client';

/**
 * Referral XP Anti-Fraud System — 4-Tranche Escrow with Reputation Scoring
 * Feature #XXX: Progressive payouts as referred user proves legitimacy
 *
 * Tranche A (100 XP): Referred user logs in on 3 distinct calendar days (UTC)
 * Tranche B (150 XP): Referred user visits 3 distinct sales (distinct saleIds)
 * Tranche C (150 XP): Referred user completes first purchase (PAID status)
 * Tranche D (100 XP): Referred user completes ANY ONE of:
 *   (a) completes a Treasure Trail, OR
 *   (b) successfully refers someone themselves (their referred user purchases), OR
 *   (c) makes a second purchase
 *
 * Reputation Score: Silently multiplies all tranche XP (0.1–1.0 range)
 * Computed daily at 2am UTC from rolling 90-day referral history
 */

export const referralTrancheService = {
  /**
   * Create a ReferralTranche record when referral code is used at signup
   */
  async createTrancheRecord(
    referrerId: string,
    referredUserId: string
  ): Promise<ReferralTranche> {
    return prisma.referralTranche.create({
      data: {
        referrerId,
        referredUserId,
        createdAt: new Date(),
        lastActivityAt: new Date(),
      },
    });
  },

  /**
   * Record a login for the referred user; increment loginsOnDistinctDays if today (UTC) not already counted
   * Release Tranche A (100 XP) if login count reaches 3 distinct days
   */
  async recordLogin(referredUserId: string): Promise<void> {
    try {
      // Find all tranches for this referred user
      const tranches = await prisma.referralTranche.findMany({
        where: { referredUserId },
        include: { referrer: true },
      });

      for (const tranche of tranches) {
        if (tranche.trancheAReleasedAt) {
          // Tranche A already released, skip
          continue;
        }

        // Get today's UTC date as YYYY-MM-DD string
        const today = new Date().toISOString().split('T')[0];

        // Check if user already logged in today (by querying PointsTransaction for VISIT type on today)
        const alreadyLoggedInToday = await prisma.pointsTransaction.findFirst({
          where: {
            userId: referredUserId,
            type: 'VISIT', // Use VISIT as proxy for login tracking; or create separate login table
            createdAt: {
              gte: new Date(`${today}T00:00:00Z`),
              lte: new Date(`${today}T23:59:59Z`),
            },
          },
        });

        // If not yet logged in today, increment distinct day count
        if (!alreadyLoggedInToday) {
          const updatedTranche = await prisma.referralTranche.update({
            where: { id: tranche.id },
            data: {
              loginsOnDistinctDays: {
                increment: 1,
              },
              lastActivityAt: new Date(),
            },
          });

          // Check if we've reached 3 distinct days and release Tranche A
          if (updatedTranche.loginsOnDistinctDays >= 3) {
            await this.releaseTrancheXp(
              tranche.referrerId,
              referredUserId,
              'A',
              XP_AWARDS.REFERRAL_TRANCHE_A
            );
          }
        }
      }
    } catch (err) {
      console.error(
        `[referralTrancheService] recordLogin failed for user ${referredUserId}:`,
        err
      );
      // Never fail the underlying login
    }
  },

  /**
   * Record a sale visit for the referred user; add saleId to distinctSalesVisited if not present
   * Release Tranche B (150 XP) if distinct sales count reaches 3
   */
  async recordSaleVisit(referredUserId: string, saleId: string): Promise<void> {
    try {
      // Find all tranches for this referred user
      const tranches = await prisma.referralTranche.findMany({
        where: { referredUserId },
      });

      for (const tranche of tranches) {
        if (tranche.trancheBReleasedAt) {
          // Tranche B already released, skip
          continue;
        }

        // Check if saleId already in distinctSalesVisited
        const alreadyVisited = (tranche.distinctSalesVisited || []).includes(
          saleId
        );

        if (!alreadyVisited) {
          // Add saleId to array
          const updatedTranche = await prisma.referralTranche.update({
            where: { id: tranche.id },
            data: {
              distinctSalesVisited: {
                push: saleId,
              },
              lastActivityAt: new Date(),
            },
          });

          // Check if we've reached 3 distinct sales and release Tranche B
          if (updatedTranche.distinctSalesVisited.length >= 3) {
            await this.releaseTrancheXp(
              tranche.referrerId,
              referredUserId,
              'B',
              XP_AWARDS.REFERRAL_TRANCHE_B
            );
          }
        }
      }
    } catch (err) {
      console.error(
        `[referralTrancheService] recordSaleVisit failed for user ${referredUserId}:`,
        err
      );
      // Never fail the underlying sale visit
    }
  },

  /**
   * Record a purchase completion for the referred user
   * Release Tranche C (150 XP) immediately
   * Check for 2nd purchase and release Tranche D via "2nd purchase" path if applicable
   */
  async recordFirstPurchase(
    referredUserId: string,
    purchaseId: string
  ): Promise<void> {
    try {
      // Find all tranches for this referred user
      const tranches = await prisma.referralTranche.findMany({
        where: { referredUserId },
      });

      for (const tranche of tranches) {
        // Release Tranche C if not already released
        if (!tranche.trancheCReleasedAt) {
          await this.releaseTrancheXp(
            tranche.referrerId,
            referredUserId,
            'C',
            XP_AWARDS.REFERRAL_TRANCHE_C
          );
        }

        // Check if this is a 2nd purchase by looking for prior REFERRAL_TRANCHE_C award to this referrer
        // Count how many purchases this user has made (via PointsTransaction PURCHASE type or via Purchase count)
        const purchaseCount = await prisma.purchase.count({
          where: {
            userId: referredUserId,
            status: 'PAID',
          },
        });

        // If this is the 2nd purchase (count >= 2), release Tranche D via "2nd purchase" path
        if (purchaseCount >= 2 && !tranche.trancheDReleasedAt) {
          // Update tranche to record secondPurchaseId
          await prisma.referralTranche.update({
            where: { id: tranche.id },
            data: {
              secondPurchaseId: purchaseId,
            },
          });

          await this.releaseTrancheXp(
            tranche.referrerId,
            referredUserId,
            'D',
            XP_AWARDS.REFERRAL_TRANCHE_D
          );
        }
      }
    } catch (err) {
      console.error(
        `[referralTrancheService] recordFirstPurchase failed for user ${referredUserId}:`,
        err
      );
      // Never fail the underlying purchase
    }
  },

  /**
   * Record treasure trail completion for the referred user
   * Release Tranche D (100 XP) via trail path if not already released
   */
  async recordTrailCompletion(referredUserId: string): Promise<void> {
    try {
      // Find all tranches for this referred user
      const tranches = await prisma.referralTranche.findMany({
        where: { referredUserId },
      });

      for (const tranche of tranches) {
        if (!tranche.trancheDReleasedAt) {
          // Update tranche to record trail completion
          await prisma.referralTranche.update({
            where: { id: tranche.id },
            data: {
              trailCompletedAt: new Date(),
            },
          });

          await this.releaseTrancheXp(
            tranche.referrerId,
            referredUserId,
            'D',
            XP_AWARDS.REFERRAL_TRANCHE_D
          );
        }
      }
    } catch (err) {
      console.error(
        `[referralTrancheService] recordTrailCompletion failed for user ${referredUserId}:`,
        err
      );
      // Never fail the underlying trail completion
    }
  },

  /**
   * Record that the referred user's own referral succeeded (their referred user made a purchase)
   * Release Tranche D (100 XP) via own-referral path if not already released
   */
  async recordOwnReferralSuccess(referredUserId: string): Promise<void> {
    try {
      // Find all tranches for this referred user
      const tranches = await prisma.referralTranche.findMany({
        where: { referredUserId },
      });

      for (const tranche of tranches) {
        if (!tranche.trancheDReleasedAt) {
          // Update tranche to record own referral success
          await prisma.referralTranche.update({
            where: { id: tranche.id },
            data: {
              ownReferralSucceeded: true,
            },
          });

          await this.releaseTrancheXp(
            tranche.referrerId,
            referredUserId,
            'D',
            XP_AWARDS.REFERRAL_TRANCHE_D
          );
        }
      }
    } catch (err) {
      console.error(
        `[referralTrancheService] recordOwnReferralSuccess failed for user ${referredUserId}:`,
        err
      );
      // Never fail the underlying referral logic
    }
  },

  /**
   * Internal: Release XP for a specific tranche
   * Checks tranche not already released, gets reputation multiplier, awards XP with idempotency key
   */
  async releaseTrancheXp(
    referrerId: string,
    referredUserId: string,
    tranche: 'A' | 'B' | 'C' | 'D',
    xpAmount: number
  ): Promise<void> {
    try {
      const trancheRecord = await prisma.referralTranche.findUnique({
        where: {
          referrerId_referredUserId: { referrerId, referredUserId },
        },
      });

      if (!trancheRecord) {
        console.warn(
          `[referralTrancheService] No tranche record found for ${referrerId} -> ${referredUserId}`
        );
        return;
      }

      // Check if already released based on tranche letter
      const releaseFieldName = `tranche${tranche}ReleasedAt`;
      const alreadyReleased =
        (trancheRecord as any)[releaseFieldName] !== null;

      if (alreadyReleased) {
        // Already released, skip
        return;
      }

      // Get reputation multiplier for referrer
      const multiplier = await this.getReputationMultiplier(referrerId);
      const adjustedXp = Math.floor(xpAmount * multiplier);

      // Award XP with idempotency key
      const idempotencyKey = `referral_tranche_${tranche}_${referrerId}_${referredUserId}`;

      // Check if this XP award already exists (idempotency check)
      const existingAward = await prisma.pointsTransaction.findFirst({
        where: {
          userId: referrerId,
          type: `REFERRAL_TRANCHE_${tranche}`,
          description: idempotencyKey,
        },
      });

      if (!existingAward) {
        // Award the XP
        await awardXp(referrerId, `REFERRAL_TRANCHE_${tranche}`, adjustedXp, {
          purchaseId: undefined,
          description: idempotencyKey,
        });
      }

      // Mark tranche as released
      const updateData: any = {
        lastActivityAt: new Date(),
      };
      updateData[releaseFieldName] = new Date();

      await prisma.referralTranche.update({
        where: {
          referrerId_referredUserId: { referrerId, referredUserId },
        },
        data: updateData,
      });
    } catch (err) {
      console.error(
        `[referralTrancheService] releaseTrancheXp failed for ${referrerId} -> ${referredUserId} tranche ${tranche}:`,
        err
      );
      // Never fail — this is non-critical
    }
  },

  /**
   * Get reputation multiplier for a referrer
   * Returns 0.1–1.0 range based on their successful referral history
   * Returns 1.0 if referrer has < 3 referrals in 90-day window (insufficient data)
   * Multiplier floor: 0.1 (never zero)
   */
  async getReputationMultiplier(referrerId: string): Promise<number> {
    try {
      const score = await prisma.referrerReputationScore.findUnique({
        where: { referrerId },
      });

      if (!score || score.totalReferrals < 3) {
        // Insufficient referral history, use full credit
        return 1.0;
      }

      // Return score (already clamped 0.0–1.0), with floor of 0.1
      return Math.max(score.score, 0.1);
    } catch (err) {
      console.error(
        `[referralTrancheService] getReputationMultiplier failed for ${referrerId}:`,
        err
      );
      // On error, default to full credit
      return 1.0;
    }
  },

  /**
   * Recompute all reputation scores from rolling 90-day referral history
   * Called daily at 2am UTC via background job
   * Score = fully-earned referral pairs / total referral pairs in 90-day window
   */
  async recomputeAllScores(): Promise<void> {
    try {
      // Get all referrers with tranches in last 90 days
      const ninetyDaysAgo = new Date(
        Date.now() - 90 * 24 * 60 * 60 * 1000
      );

      const activeReferrers = await prisma.referralTranche.findMany({
        where: {
          createdAt: {
            gte: ninetyDaysAgo,
          },
        },
        distinct: ['referrerId'],
        select: { referrerId: true },
      });

      for (const { referrerId } of activeReferrers) {
        // Get all tranches for this referrer in 90-day window
        const tranches = await prisma.referralTranche.findMany({
          where: {
            referrerId,
            createdAt: {
              gte: ninetyDaysAgo,
            },
          },
        });

        const totalCount = tranches.length;
        const fullyEarnedCount = tranches.filter(
          (t) => t.trancheDReleasedAt !== null
        ).length;

        const score =
          totalCount > 0 ? fullyEarnedCount / totalCount : 1.0;

        // Upsert reputation score
        await prisma.referrerReputationScore.upsert({
          where: { referrerId },
          create: {
            referrerId,
            totalReferrals: totalCount,
            fullyEarnedCount,
            score,
            lastUpdatedAt: new Date(),
          },
          update: {
            totalReferrals: totalCount,
            fullyEarnedCount,
            score,
            lastUpdatedAt: new Date(),
          },
        });
      }

      console.log(
        `[referralTrancheService] Reputation scores recomputed for ${activeReferrers.length} referrers`
      );
    } catch (err) {
      console.error(
        '[referralTrancheService] recomputeAllScores failed:',
        err
      );
    }
  },
};
