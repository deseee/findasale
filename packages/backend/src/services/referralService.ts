import { prisma } from '../lib/prisma';

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

    // Generate alphanumeric code: 8 characters
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();

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
 */
export const processReferral = async (
  referrerId: string,
  referredUserId: string,
): Promise<void> => {
  try {
    // Check if reward already exists
    const existing = await prisma.referralReward.findUnique({
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

    // Create reward record and atomically update user points
    await prisma.$transaction([
      prisma.referralReward.create({
        data: {
          referrerId,
          referredUserId,
          rewardType: 'POINTS',
          rewardValue: REWARD_POINTS_PER_REFERRAL,
        },
      }),
      prisma.user.update({
        where: { id: referrerId },
        data: { points: { increment: REWARD_POINTS_PER_REFERRAL } },
      }),
    ]);
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
