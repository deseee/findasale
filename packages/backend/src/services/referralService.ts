import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { awardXp, checkMonthlyXpCap, applyHuntPassMultiplier, XP_AWARDS } from './xpService';

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
    // Find matching introduction record
    const introduction = await prisma.shopperOrganizerIntroduction.findUnique({
      where: {
        shopperId_organizerId: {
          shopperId,
          organizerId,
        },
      },
    });

    // Not found or already claimed
    if (!introduction || introduction.claimedAt) {
      return null;
    }

    // Check monthly XP cap
    const capRemaining = await checkMonthlyXpCap(shopperId, 'ORGANIZER_CLAIMED_MONTHLY');
    if (capRemaining <= 0) {
      return {
        success: false,
        xpAwarded: 0,
        capRemaining: 0,
      };
    }

    // Award XP with Hunt Pass multiplier
    const baseXp = XP_AWARDS.SHOPPER_INTRODUCED_ORGANIZER_CLAIMED;
    const xpToAward = await applyHuntPassMultiplier(shopperId, baseXp);
    const awardAmount = Math.min(capRemaining, xpToAward);

    const result = await awardXp(
      shopperId,
      'SHOPPER_INTRODUCED_ORGANIZER_CLAIMED',
      awardAmount,
      {
        description: `Organizer claim by organizer ${organizerId}`,
      },
    );

    if (!result) {
      return null;
    }

    // Mark introduction as claimed
    await prisma.shopperOrganizerIntroduction.update({
      where: {
        shopperId_organizerId: {
          shopperId,
          organizerId,
        },
      },
      data: {
        claimedAt: new Date(),
      },
    });

    return {
      success: true,
      xpAwarded: awardAmount,
      capRemaining: capRemaining - awardAmount,
    };
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
    // Calculate 60-day window
    const now = new Date();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Query for introduction within 60d that hasn't been upgraded yet
    const introduction = await prisma.shopperOrganizerIntroduction.findFirst({
      where: {
        organizerId,
        introducedAt: {
          gte: sixtyDaysAgo,
        },
        upgradedAt: null,
      },
    });

    // Not found or already upgraded
    if (!introduction) {
      return {
        success: false,
      };
    }

    const shopperId = introduction.shopperId;

    // Award XP with Hunt Pass multiplier
    const baseXp = XP_AWARDS.ORGANIZER_REFERRAL_PRO_UPGRADE;
    const xpToAward = await applyHuntPassMultiplier(shopperId, baseXp);

    const result = await awardXp(
      shopperId,
      'ORGANIZER_REFERRAL_PRO_UPGRADE',
      xpToAward,
      {
        description: `PRO upgrade by organizer ${organizerId}`,
      },
    );

    if (!result) {
      return null;
    }

    // Mark introduction as upgraded
    await prisma.shopperOrganizerIntroduction.update({
      where: {
        id: introduction.id,
      },
      data: {
        upgradedAt: new Date(),
      },
    });

    return {
      success: true,
      shopperId,
      xpAwarded: xpToAward,
    };
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
    // Query for first introduction that hasn't received quality tier XP yet
    const introduction = await prisma.shopperOrganizerIntroduction.findFirst({
      where: {
        organizerId,
        qualityAt: null,
      },
    });

    // Not found or already awarded
    if (!introduction) {
      return {
        success: false,
      };
    }

    const shopperId = introduction.shopperId;
    const baseXp = XP_AWARDS.ORGANIZER_REFERRAL_QUALITY_TIER;

    const result = await awardXp(
      shopperId,
      'ORGANIZER_REFERRAL_QUALITY_TIER',
      baseXp,
      {
        description: `Organizer quality tier (4.0+ rating) for organizer ${organizerId}`,
      },
    );

    if (!result) {
      return null;
    }

    // Mark introduction as quality tier awarded
    await prisma.shopperOrganizerIntroduction.update({
      where: {
        id: introduction.id,
      },
      data: {
        qualityAt: new Date(),
      },
    });

    return {
      success: true,
      shopperId,
      xpAwarded: baseXp,
    };
  } catch (error) {
    console.error('[referralService] awardQualityTierXp error:', error);
    return null;
  }
}
};

// ─── Organizer Referral XP ────────────────────────────────────────────────────

/**
 * Award XP to a shopper when an organizer they introduced claims their storefront.
 * Called from the admin claim-approval route after isClaimed is set to true.
 * Respects monthly cap (ORGANIZER_CLAIMED_MONTHLY = 1000 XP/month).
 */
export const awardOrganizerClaimedXp = async (organizerId: string): Promise<void> => {
  try {
    const intro = await prisma.shopperOrganizerIntroduction.findFirst({
      where: { organizerId, claimedAt: null },
      orderBy: { introducedAt: 'asc' },
    });
    if (!intro) return;

    const underCap = await checkMonthlyXpCap(intro.shopperId, 'ORGANIZER_CLAIMED_MONTHLY', XP_AWARDS.ORGANIZER_CLAIMED_MONTHLY);
    if (!underCap) return;

    const xp = await applyHuntPassMultiplier(intro.shopperId, XP_AWARDS.SHOPPER_INTRODUCED_ORGANIZER_CLAIMED);
    await awardXp(intro.shopperId, 'SHOPPER_INTRODUCED_ORGANIZER_CLAIMED', xp, { organizerId });
    await prisma.shopperOrganizerIntroduction.update({
      where: { id: intro.id },
      data: { claimedAt: new Date() },
    });
  } catch (error) {
    console.error('[XP] awardOrganizerClaimedXp failed:', error);
  }
};

/**
 * Award XP to a shopper when an organizer they introduced upgrades to PRO within 60 days.
 * Called from the Stripe webhook on subscription tier change to PRO.
 */
export const awardProUpgradeXp = async (organizerId: string): Promise<void> => {
  try {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const intro = await prisma.shopperOrganizerIntroduction.findFirst({
      where: { organizerId, introducedAt: { gte: cutoff }, upgradedAt: null },
      orderBy: { introducedAt: 'asc' },
    });
    if (!intro) return;

    const xp = await applyHuntPassMultiplier(intro.shopperId, XP_AWARDS.ORGANIZER_REFERRAL_PRO_UPGRADE);
    await awardXp(intro.shopperId, 'ORGANIZER_REFERRAL_PRO_UPGRADE', xp, { organizerId });
    await prisma.shopperOrganizerIntroduction.update({
      where: { id: intro.id },
      data: { upgradedAt: new Date() },
    });
  } catch (error) {
    console.error('[XP] awardProUpgradeXp failed:', error);
  }
};

/**
 * Award one-time XP to a shopper when an organizer they introduced reaches 4.0+ rating.
 * Called from reputationService after rating recalculation crosses 4.0 threshold.
 */
export const awardQualityTierXp = async (organizerId: string): Promise<void> => {
  try {
    const intro = await prisma.shopperOrganizerIntroduction.findFirst({
      where: { organizerId, qualityAt: null },
      orderBy: { introducedAt: 'asc' },
    });
    if (!intro) return;

    const xp = await applyHuntPassMultiplier(intro.shopperId, XP_AWARDS.ORGANIZER_REFERRAL_QUALITY_TIER);
    await awardXp(intro.shopperId, 'ORGANIZER_REFERRAL_QUALITY_TIER', xp, { organizerId });
    await prisma.shopperOrganizerIntroduction.update({
      where: { id: intro.id },
      data: { qualityAt: new Date() },
    });
  } catch (error) {
    console.error('[XP] awardQualityTierXp failed:', error);
  }
};
