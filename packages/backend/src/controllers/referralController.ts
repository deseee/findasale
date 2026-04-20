// Phase 23: Referral program — dashboard stats endpoint
// Task #7: Shopper Referral Rewards — new endpoints for code generation and reward claiming

import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import * as referralService from '../services/referralService';
import { awardXp, XP_AWARDS } from '../services/xpService'; // Explorer's Guild XP awards

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

    return res.json({
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
    return res.status(500).json({ message: 'Failed to fetch referral data' });
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

    // Award XP for claiming referral reward
    awardXp(req.user.id, 'REFERRAL_REWARD_CLAIMED', XP_AWARDS.REFERRAL_FIRST_PURCHASE, { couponId: rewardId }).catch(err =>
      console.error('[XP] Failed to award XP for referral reward claimed:', err)
    );

    res.json({ message: 'Reward claimed successfully', rewardId });
  } catch (error) {
    console.error('Error claiming reward:', error);
    res.status(500).json({ message: 'Failed to claim reward' });
  }
};

/**
 * D-XP-004 Phase 5: Admin endpoints for referral fraud review
 */

// GET /api/admin/referral-fraud-signals
// Paginated list of referral fraud signals, filterable by review outcome
// Admin-only endpoint
export const listFraudSignals = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Admin check is done via middleware in routes/admin.ts
    const { outcome = 'PENDING', page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit as string) || 50));
    const offset = (pageNum - 1) * limitNum;

    const signals = await prisma.referralFraudSignal.findMany({
      where: outcome && outcome !== 'ALL' ? { reviewOutcome: outcome as string } : {},
      include: {
        referralReward: {
          select: {
            id: true,
            referrerId: true,
            referredUserId: true,
            fraudReviewStatus: true,
            deviceFraudScore: true,
            ipFraudScore: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limitNum
    });

    const total = await prisma.referralFraudSignal.count({
      where: outcome && outcome !== 'ALL' ? { reviewOutcome: outcome as string } : {}
    });

    res.json({
      signals,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('[admin] Error listing fraud signals:', error);
    res.status(500).json({ message: 'Failed to list fraud signals' });
  }
};

// PATCH /api/admin/referral-fraud-signals/:signalId/review
// Review a fraud signal and decide: APPROVED or REJECTED
// Admin-only endpoint
export const reviewFraudSignal = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Admin check is done via middleware in routes/admin.ts
    const { signalId } = req.params;
    const { outcome, notes } = req.body;

    // Validate outcome
    if (!['APPROVED', 'REJECTED'].includes(outcome)) {
      return res.status(400).json({ message: 'Invalid outcome. Must be APPROVED or REJECTED.' });
    }

    // Get the signal
    const signal = await prisma.referralFraudSignal.findUnique({
      where: { id: signalId },
      include: { referralReward: { select: { id: true, referrerId: true } } }
    });

    if (!signal) {
      return res.status(404).json({ message: 'Signal not found' });
    }

    // Update the signal
    const updated = await prisma.referralFraudSignal.update({
      where: { id: signalId },
      data: {
        reviewOutcome: outcome,
        reviewedByAdminId: req.user.id,
        reviewedAt: new Date(),
        notes
      }
    });

    // If APPROVED, also update the referral reward status and trigger deferred XP award if applicable
    if (outcome === 'APPROVED') {
      await prisma.referralReward.update({
        where: { id: signal.referralReward.id },
        data: { fraudReviewStatus: 'APPROVED' }
      });

      // If there's a deferred reward with DEVICE_ABUSE reason, we can now award XP
      const reward = await prisma.referralReward.findUnique({
        where: { id: signal.referralReward.id }
      });

      if (reward && reward.deferredReason === 'DEVICE_ABUSE') {
        // Award XP to referrer now that fraud is cleared
        const { awardXp, XP_AWARDS } = await import('../services/xpService');
        awardXp(reward.referrerId, 'REFERRAL_FIRST_PURCHASE', XP_AWARDS.REFERRAL_FIRST_PURCHASE, {
          description: 'First purchase referral bonus (approved by admin)'
        }).catch(err =>
          console.error('[admin] Failed to award deferred XP:', err)
        );

        // Clear deferred status
        await prisma.referralReward.update({
          where: { id: reward.id },
          data: {
            deferredUntil: null,
            deferredReason: null,
            fraudReviewStatus: 'APPROVED'
          }
        });
      }
    } else {
      // REJECTED: mark as rejected
      await prisma.referralReward.update({
        where: { id: signal.referralReward.id },
        data: { fraudReviewStatus: 'REJECTED' }
      });
    }

    res.json({
      message: `Signal ${outcome.toLowerCase()}`,
      signal: updated
    });
  } catch (error) {
    console.error('[admin] Error reviewing fraud signal:', error);
    res.status(500).json({ message: 'Failed to review signal' });
  }
};
