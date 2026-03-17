// Phase 23: Referral program — dashboard stats endpoint
// Task #7: Shopper Referral Rewards — new endpoints for code generation and reward claiming

import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import * as referralService from '../services/referralService';

// GET /api/referrals/dashboard
// Returns referral stats for the authenticated user
export const getDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user.id;

    const referrals = await prisma.referral.findMany({
      where: { referrerId: userId },
      include: {
        referredUser: {
          select: { name: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      totalReferrals: referrals.length,
      conversions: referrals.length, // each referral = signup conversion
      earnings: '0.00',              // monetary payouts pending payment integration
      referrals: referrals.map((r) => ({
        id: r.id,
        name: r.referredUser.name,
        joinedAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching referral dashboard:', error);
    res.status(500).json({ message: 'Failed to fetch referral data' });
  }
};

// GET /api/referrals/my-code
// Return user's referral code (generate if missing)
export const getMyCode = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const referralCode = await referralService.generateReferralCode(req.user.id);
    const frontendUrl = process.env.FRONTEND_URL || 'https://finda.sale';
    const referralLink = `${frontendUrl}/refer/${referralCode}`;

    res.json({
      referralCode,
      referralLink,
    });
  } catch (error) {
    console.error('Error getting referral code:', error);
    res.status(500).json({ message: 'Failed to get referral code' });
  }
};

// GET /api/referrals/stats
// Return user's referral statistics
export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const stats = await referralService.getReferralStats(req.user.id);

    res.json(stats);
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    res.status(500).json({ message: 'Failed to fetch referral stats' });
  }
};

// POST /api/referrals/claim/:rewardId
// Claim/redeem a specific referral reward
export const claimReward = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { rewardId } = req.params;

    // Verify the reward belongs to the user
    const reward = await prisma.referralReward.findUnique({
      where: { id: rewardId },
    });

    if (!reward) {
      return res.status(404).json({ message: 'Reward not found' });
    }

    if (reward.referrerId !== req.user.id) {
      return res.status(403).json({ message: 'Forbidden: reward does not belong to user' });
    }

    if (reward.redeemedAt) {
      return res.status(400).json({ message: 'Reward already redeemed' });
    }

    await referralService.claimReward(rewardId);

    res.json({ message: 'Reward claimed successfully', rewardId });
  } catch (error) {
    console.error('Error claiming reward:', error);
    res.status(500).json({ message: 'Failed to claim reward' });
  }
};
