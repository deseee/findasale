/**
 * Lucky Roll Controller — GET eligibility (public), POST roll (auth required)
 * Phase 2b: Weekly XP gacha endpoints
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getEligibility, performRoll } from '../services/luckyRollService';

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
    // performRoll() now creates the COUPON_1 coupon INSIDE the same DB transaction as the
    // XP deduction (luckyRollService.ts, 2026-08-07 data-integrity fix) — no more
    // fire-and-forget coupon generation after the response commits.
    const result = await performRoll(req.user.id);

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
