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


/**
 * Award org referral first-sale reward to the organizer who referred `referredUserId`.
 * Fires when `referredUserId`'s organizer publishes their first sale.
 *
 * Reward: extend referrer's referralDiscountExpiry by 30 days (free tier upgrade).
 * Idempotency: checked via pointsTransaction type 'REFERRAL_ORG_FIRST_SALE' scoped to the
 * referredUserId description, so multiple referred orgs can each trigger a reward.
 *
 * @param referredUserId — userId of the organizer who just published their first sale
 */
export async function awardOrgReferralFirstSale(referredUserId: string): Promise<void> {
  try {
    // Find the ReferralReward record that tracks who referred this organizer at signup
    const signupReferral = await prisma.referralReward.findFirst({
      where: { referredUserId },
      select: { referrerId: true },
    });

    if (!signupReferral) {
      // This organizer wasn't referred by anyone — nothing to do
      return;
    }

    const referrerId = signupReferral.referrerId;

    // Idempotency: check if this exact referral has already been rewarded
    // Use pointsTransaction description to scope per referred organizer
    const alreadyRewarded = await prisma.pointsTransaction.findFirst({
      where: {
        userId: referrerId,
        type: 'REFERRAL_ORG_FIRST_SALE',
        description: {
          contains: referredUserId,
        },
      },
    });

    if (alreadyRewarded) {
      return;
    }

    // Find the referrer's organizer profile for businessName (for notification) and discount expiry
    const referrerOrganizer = await prisma.organizer.findUnique({
      where: { userId: referrerId },
      select: { id: true, referralDiscountExpiry: true },
    });

    // Find the referred organizer's businessName for the notification message
    const referredOrganizer = await prisma.organizer.findUnique({
      where: { userId: referredUserId },
      select: { businessName: true },
    });

    const businessName = referredOrganizer?.businessName ?? 'Your referral';

    // Award 50 XP to the referrer (tracks idempotency via pointsTransaction)
    await awardXp(referrerId, 'REFERRAL_ORG_FIRST_SALE', XP_AWARDS.REFERRAL_ORG_FIRST_SALE, {
      description: `Referred organizer first sale: ${referredUserId}`,
    });

    // Extend referralDiscountExpiry by 30 days (free tier upgrade benefit)
    if (referrerOrganizer) {
      const now = new Date();
      const currentExpiry = referrerOrganizer.referralDiscountExpiry;
      // If expiry is in the future, extend from it; otherwise extend from now
      const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
      const newExpiry = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);

      await prisma.organizer.update({
        where: { id: referrerOrganizer.id },
        data: { referralDiscountExpiry: newExpiry },
      });
    }

    // Notify the referrer
    await prisma.notification.create({
      data: {
        userId: referrerId,
        type: 'referral_org_first_sale',
        title: 'Your referral just published their first sale!',
        body: `${businessName} just published their first sale. You've earned a 30-day reward on your account.`,
        link: '/organizer/referrals',
        channel: 'OPERATIONAL',
      },
    });
  } catch (error) {
    console.error('[referralService] awardOrgReferralFirstSale error:', error);
    // Intentionally re-throw — caller wraps in .catch() so this is safe
    throw error;
  }
}

/**
 * Get organizer referral stats for the referral dashboard page.
 * Returns: referral link, total orgs referred, how many published first sale, rewards earned.
 *
 * @param userId — the organizer's userId
 */
export async function getOrgReferralStats(userId: string): Promise<{
  referralCode: string | null;
  referralLink: string;
  totalOrgsReferred: number;
  firstSalePublished: number;
  totalXpEarned: number;
}> {
  // Get referral code
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });

  const referralCode = user?.referralCode ?? null;
  const referralLink = referralCode
    ? `https://finda.sale/signup?ref=${referralCode}`
    : '';

  // Find all orgs this user referred at signup
  const signupReferrals = await prisma.referralReward.findMany({
    where: { referrerId: userId },
    select: { referredUserId: true },
  });

  const totalOrgsReferred = signupReferrals.length;

  // Count how many of those referred users have published a first sale
  // (identified by a REFERRAL_ORG_FIRST_SALE pointsTransaction containing their userId)
  const firstSaleTransactions = await prisma.pointsTransaction.findMany({
    where: {
      userId,
      type: 'REFERRAL_ORG_FIRST_SALE',
    },
    select: { points: true },
  });

  const firstSalePublished = firstSaleTransactions.length;
  const totalXpEarned = firstSaleTransactions.reduce((sum, t) => sum + t.points, 0);

  return {
    referralCode,
    referralLink,
    totalOrgsReferred,
    firstSalePublished,
    totalXpEarned,
  };
}
