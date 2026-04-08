/**
 * Lucky Roll Controller — GET eligibility (public), POST roll (auth required)
 * Phase 2b: Weekly XP gacha endpoints
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getEligibility, performRoll } from '../services/luckyRollService';
import { prisma } from '../lib/prisma';

/**
 * GET /api/lucky-roll/eligibility
 * Public (auth optional). Returns roll availability, XP balance, and full odds table.
 */
export const getEligibilityHandler = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const eligibility = await getEligibility(userId);
    return res.json(eligibility);
  } catch (error) {
    console.error('[luckyRoll] getEligibility error:', error);
    return res.status(500).json({ message: 'Failed to fetch eligibility' });
  }
};

/**
 * POST /api/lucky-roll/roll
 * Auth required. Performs the roll transaction: deduct XP, apply pity, award outcome, update counters.
 */
export const rollHandler = async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const result = await performRoll(req.user.id);

    // If outcome is COUPON_1, generate the coupon (async, fire-and-forget)
    if (result.outcome === 'COUPON_1') {
      generateCouponForLuckyRoll(req.user.id).catch((err) =>
        console.error('[luckyRoll] Failed to generate COUPON_1:', err)
      );
    }

    return res.json(result);
  } catch (error: any) {
    console.error('[luckyRoll] roll error:', error);

    if (error.message?.includes('Account must be at least 30 days old')) {
      return res.status(400).json({ message: error.message });
    }
    if (error.message?.includes('costs 100 XP')) {
      return res.status(400).json({ message: error.message });
    }
    if (error.message?.includes('already rolled this week')) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({ message: 'Failed to perform roll' });
  }
};

/**
 * Helper: Generate a shopper coupon for COUPON_1 outcome
 * Fire-and-forget async function
 */
async function generateCouponForLuckyRoll(userId: string): Promise<void> {
  try {
    const code = generateCouponCode();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.coupon.create({
      data: {
        code,
        userId,
        discountType: 'FIXED',
        discountValue: 1.0,
        minPurchaseAmount: 10,
        status: 'ACTIVE',
        sourcePurchaseId: null,
        generatedFromXp: true,
        xpTier: 'DOLLAR_OFF_TEN',
        xpSpent: 100,
        expiresAt,
      },
    });

    // TODO: Send notification to user with coupon code
    console.log(`[luckyRoll] Generated COUPON_1 ${code} for user ${userId}`);
  } catch (error) {
    console.error('[luckyRoll] Failed to generate coupon for COUPON_1:', error);
    throw error;
  }
}

/** Generate an 8-char uppercase hex code */
function generateCouponCode(): string {
  const crypto = require('crypto');
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}
