import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { awardXp, XP_AWARDS } from '../services/xpService';
import { getAccountAgeDays, MIN_ACCOUNT_AGE_DAYS } from '../services/referralFraudService';

/**
 * D-XP-004 Phase 4: Referral Reward Age Gate Cron
 * Runs daily at 2 AM UTC
 * Processes deferred referral rewards that are now eligible:
 * - Checks if deferredUntil <= now
 * - Verifies account age >= MIN_ACCOUNT_AGE_DAYS
 * - Awards XP to referrer via awardXp
 * - Prevents duplicate XP awards via idempotency check (PointsTransaction)
 */

export function scheduleReferralRewardAgeGateCron() {
  // 0 2 * * * = every day at 2 AM UTC
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('[referralRewardAgeGateCron] Starting at', new Date().toISOString());

      // Find all deferred rewards that are now eligible
      const eligibleRewards = await prisma.referralReward.findMany({
        where: {
          deferredUntil: { lte: new Date() },
          deferredReason: 'ACCOUNT_AGE_GATE',
          fraudReviewStatus: 'CLEAR'
        },
        include: {
          referrer: { select: { id: true, name: true } },
          referredUser: { select: { id: true, name: true, createdAt: true } }
        }
      });

      console.log(
        `[referralRewardAgeGateCron] Found ${eligibleRewards.length} rewards eligible for processing`
      );

      for (const reward of eligibleRewards) {
        try {
          // Verify account age is now >= MIN_ACCOUNT_AGE_DAYS
          const ageDays = getAccountAgeDays(reward.referredUser.createdAt);

          if (ageDays < MIN_ACCOUNT_AGE_DAYS) {
            // Not ready yet — skip
            console.warn(
              `[referralRewardAgeGateCron] Reward ${reward.id} not ready yet (${ageDays}/${MIN_ACCOUNT_AGE_DAYS} days)`
            );
            continue;
          }

          // Check idempotency: has XP already been awarded?
          const existingTxn = await prisma.pointsTransaction.findFirst({
            where: {
              userId: reward.referrerId,
              type: 'REFERRAL_FIRST_PURCHASE',
              purchaseId: reward.id // Link back to referral reward ID
            }
          });

          if (existingTxn) {
            // XP already awarded — skip
            console.log(
              `[referralRewardAgeGateCron] Reward ${reward.id} already processed (txn ${existingTxn.id})`
            );

            // Clean up: clear deferredUntil
            await prisma.referralReward.update({
              where: { id: reward.id },
              data: { deferredUntil: null }
            });

            continue;
          }

          // Award XP to referrer
          const result = await awardXp(
            reward.referrerId,
            'REFERRAL_FIRST_PURCHASE',
            XP_AWARDS.REFERRAL_FIRST_PURCHASE,
            {
              description: `First purchase referral bonus (deferred from ${reward.awardedAt.toISOString()})`
            }
          );

          if (result) {
            // Clear deferral fields
            await prisma.referralReward.update({
              where: { id: reward.id },
              data: { deferredUntil: null, deferredReason: null }
            });

            console.log(
              `[referralRewardAgeGateCron] Awarded XP to referrer ${reward.referrer.id} for reward ${reward.id}`
            );
          } else {
            console.warn(
              `[referralRewardAgeGateCron] XP award returned null for referrer ${reward.referrer.id}`
            );
          }
        } catch (rewardErr) {
          console.error(
            `[referralRewardAgeGateCron] Failed to process reward ${reward.id}:`,
            rewardErr
          );
          // Continue to next reward
        }
      }

      console.log('[referralRewardAgeGateCron] Completed successfully');
    } catch (error) {
      console.error('[referralRewardAgeGateCron] Job failed:', error);
    }
  });

  console.log('[referralRewardAgeGateCron] Scheduled (0 2 * * *)');
}
