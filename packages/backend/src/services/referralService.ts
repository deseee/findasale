import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { awardXp, checkMonthlyXpCap, XP_AWARDS } from './xpService';

const REWARD_POINTS_PER_REFERRAL = 50;
const REWARD_CREDIT_PER_REFERRAL = 5.0; // $5 store credit

/**
 * Generate a referral code for a user if they don't have one.
 * Returns existing code if already present.
 */
export const generateReferralCode = async (userId: string): Promise<string> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.referralCode) {
      return user.referralCode;
    }

    // Generate cryptographically secure 8-character hex code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Ensure uniqueness
    const existing = await prisma.user.findUnique({
      where: { referralCode: code },
    });

    if (existing) {
      // Recursive retry on collision (unlikely but safe)
      return generateReferralCode(userId);
    }

    // Save the code
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { referralCode: code },
      select: { referralCode: true },
    });

    return updated.referralCode!;
  } catch (error) {
    console.error('Error generating referral code:', error);
    throw error;
  }
};

/**
 * Process a referral: award points to the referrer.
 * Called when a referred user completes signup or first purchase.
 * Checks for existing reward to prevent duplicates.
 *
 * SECURITY: Now accepts optional Prisma transaction client to ensure atomicity
 * with user creation and prevent race-condition duplicate rewards.
 */
export const processReferral = async (
  referrerId: string,
  referredUserId: string,
  txClient: any = null, // Optional Prisma transaction client
): Promise<void> => {
  try {
    const client = txClient || prisma;

    // Check if reward already exists
    const existing = await client.referralReward.findUnique({
      where: {
        referrerId_referredUserId: {
          referrerId,
          referredUserId,
        },
      },
    });

    if (existing) {
      console.warn(
        `Referral reward already exists for referrer=${referrerId}, referred=${referredUserId}`,
      );
      return;
    }

    // Create reward record
    await client.referralReward.create({
      data: {
        referrerId,
        referredUserId,
        rewardType: 'POINTS',
        rewardValue: REWARD_POINTS_PER_REFERRAL,
      },
    });
  } catch (error) {
    console.error('Error processing referral:', error);
    throw error;
  }
};

/**
 * Get referral statistics for a user.
 * Returns total referrals made, total rewards earned, and pending (unredeemed) rewards count.
 */
export const getReferralStats = async (userId: string): Promise<{
  totalReferrals: number;
  totalRewardsEarned: number;
  pendingRewards: number;
}> => {
  try {
    const rewards = await prisma.referralReward.findMany({
      where: { referrerId: userId },
      select: {
        rewardValue: true,
        redeemedAt: true,
      },
    });

    const totalReferrals = rewards.length;
    const totalRewardsEarned = rewards.reduce((sum, r) => sum + r.rewardValue, 0);
    const pendingRewards = rewards.filter((r) => !r.redeemedAt).length;

    return {
      totalReferrals,
      totalRewardsEarned,
      pendingRewards,
    };
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    throw error;
  }
};

/**
 * Claim/redeem a specific referral reward by marking it as redeemed.
 */
export const claimReward = async (rewardId: string): Promise<void> => {
  try {
    await prisma.referralReward.update({
      where: { id: rewardId },
      data: { redeemedAt: new Date() },
    });
  } catch (error) {
    console.error('Error claiming reward:', error);
    throw error;
  }
};

/**
 * Award XP to shopper when organizer they introduced claims their storefront
 * Called when organizer completes account claim flow
 * Checks monthly cap (ORGANIZER_CLAIMED_MONTHLY) before awarding
 *
 * @param shopperId — shopper who made introduction
 * @param organizerId — organizer claiming storefront
 * @returns { success: boolean; xpAwarded: number; capRemaining: number } or null on error
 */
export async function awardOrganizerClaimedXp(
  shopperId: string,
  organizerId: string,
): Promise<{ success: boolean; xpAwarded: number; capRemaining: number } | null> {
  try {
    // [BLOCKED] Awaiting schema confirmation: ShopperOrganizerIntroduction model must exist
    // STUB IMPLEMENTATION BELOW — will be completed once schema model is added

    // TODO: When ShopperOrganizerIntroduction exists, implement:
    // 1. Check monthly XP cap: remaining = await checkMonthlyXpCap(shopperId, 'ORGANIZER_CLAIMED_MONTHLY')
    // 2. If remaining > 0, award XP: await awardXp(shopperId, 'SHOPPER_INTRODUCED_ORGANIZER_CLAIMED', Math.min(remaining, XP_AWARDS.SHOPPER_INTRODUCED_ORGANIZER_CLAIMED))
    // 3. Update ShopperOrganizerIntroduction record: set claimedAt = now
    // 4. Return { success: true, xpAwarded, capRemaining }

    console.warn('[referralService] awardOrganizerClaimedXp stubbed — awaiting ShopperOrganizerIntroduction schema');
    return null;
  } catch (error) {
    console.error('[referralService] awardOrganizerClaimedXp error:', error);
    return null;
  }
}

/**
 * Award XP to shopper when organizer they introduced upgrades to PRO
 * Called when organizer tier changes to PRO
 * Looks back 60 days for ShopperOrganizerIntroduction match
 * Only awards if 60-day window is open AND no prior upgrade award
 *
 * @param organizerId — organizer upgrading to PRO
 * @returns { success: boolean; shopperId?: string; xpAwarded?: number } or null on error
 */
export async function awardProUpgradeXp(
  organizerId: string,
): Promise<{ success: boolean; shopperId?: string; xpAwarded?: number } | null> {
  try {
    // [BLOCKED] Awaiting schema confirmation: ShopperOrganizerIntroduction model must exist
    // STUB IMPLEMENTATION BELOW — will be completed once schema model is added

    // TODO: When ShopperOrganizerIntroduction exists, implement:
    // 1. Calculate 60-day window: now = new Date(), sixtyDaysAgo = new Date(now - 60*24*60*60*1000)
    // 2. Query ShopperOrganizerIntroduction where organizerId = arg AND introducedAt >= sixtyDaysAgo AND upgradedAt IS NULL
    // 3. If found: award XP: await awardXp(shopperId, 'ORGANIZER_REFERRAL_PRO_UPGRADE', XP_AWARDS.ORGANIZER_REFERRAL_PRO_UPGRADE)
    // 4. Update ShopperOrganizerIntroduction: set upgradedAt = now
    // 5. Return { success: true, shopperId, xpAwarded }
    // 6. If not found: Return { success: false }

    console.warn('[referralService] awardProUpgradeXp stubbed — awaiting ShopperOrganizerIntroduction schema');
    return null;
  } catch (error) {
    console.error('[referralService] awardProUpgradeXp error:', error);
    return null;
  }
}

/**
 * Award XP to shopper when organizer they introduced reaches 4.0+ rating
 * Called when organizer's ratingAverage crosses 4.0 threshold
 * One-time per organizer — tracks in ShopperOrganizerIntroduction.qualityAt
 *
 * @param organizerId — organizer reaching 4.0+ rating
 * @returns { success: boolean; shopperId?: string; xpAwarded?: number } or null on error
 */
export async function awardQualityTierXp(
  organizerId: string,
): Promise<{ success: boolean; shopperId?: string; xpAwarded?: number } | null> {
  try {
    // [BLOCKED] Awaiting schema confirmation: ShopperOrganizerIntroduction model must exist
    // STUB IMPLEMENTATION BELOW — will be completed once schema model is added

    // TODO: When ShopperOrganizerIntroduction exists, implement:
    // 1. Query ShopperOrganizerIntroduction where organizerId = arg AND qualityAt IS NULL (take first match)
    // 2. If found: award XP: await awardXp(shopperId, 'ORGANIZER_REFERRAL_QUALITY_TIER', XP_AWARDS.ORGANIZER_REFERRAL_QUALITY_TIER)
    // 3. Update ShopperOrganizerIntroduction: set qualityAt = now
    // 4. Return { success: true, shopperId, xpAwarded }
    // 5. If not found: Return { success: false }

    console.warn('[referralService] awardQualityTierXp stubbed — awaiting ShopperOrganizerIntroduction schema');
    return null;
  } catch (error) {
    console.error('[referralService] awardQualityTierXp error:', error);
    return null;
  }
}
