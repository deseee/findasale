import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../index';

export interface PosTierStatus {
  tier: 0 | 1 | 2 | 3;
  transactionCount: number;
  totalRevenue: number;
  nextGate?: {
    tier: 1 | 2 | 3;
    txNeeded: number;
    revenueNeeded: number;
  };
}

const TIER_GATES = {
  1: { minTx: 5, minRevenue: 50 },
  2: { minTx: 20, minRevenue: 300 },
  3: { minTx: 50, minRevenue: 1000 },
};

/**
 * GET /api/organizer/pos-tiers
 * Returns the organizer's current POS value unlock tier status
 * Tiers are based on transaction count + minimum dollar spend
 */
export const getPosTierStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    // Get organizer by user ID
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer profile not found' });
    }

    // Get user's subscription tier for PRO gating
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roleSubscriptions: {
          where: { role: 'ORGANIZER' },
        },
      },
    });

    // Determine subscription tier (check UserRoleSubscription for ORGANIZER role)
    let subscriptionTier = 'SIMPLE';
    if (user?.roleSubscriptions && user.roleSubscriptions.length > 0) {
      subscriptionTier = user.roleSubscriptions[0].subscriptionTier;
    }

    // Fetch all PAID purchases for this organizer's sales
    const purchases = await prisma.purchase.findMany({
      where: {
        status: 'PAID',
        sale: {
          organizerId: organizer.id,
        },
      },
      select: {
        amount: true,
      },
    });

    const transactionCount = purchases.length;
    const totalRevenue = purchases.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // Determine current tier
    let currentTier: 0 | 1 | 2 | 3 = 0;

    // Tier 3: 50 tx + $1000 + PRO subscription
    if (
      transactionCount >= TIER_GATES[3].minTx &&
      totalRevenue >= TIER_GATES[3].minRevenue &&
      subscriptionTier === 'PRO'
    ) {
      currentTier = 3;
    }
    // Tier 2: 20 tx + $300
    else if (
      transactionCount >= TIER_GATES[2].minTx &&
      totalRevenue >= TIER_GATES[2].minRevenue
    ) {
      currentTier = 2;
    }
    // Tier 1: 5 tx + $50
    else if (
      transactionCount >= TIER_GATES[1].minTx &&
      totalRevenue >= TIER_GATES[1].minRevenue
    ) {
      currentTier = 1;
    }

    // Calculate next gate progress
    let nextGate: { tier: 1 | 2 | 3; txNeeded: number; revenueNeeded: number } | undefined;

    if (currentTier === 0) {
      // Moving to Tier 1
      nextGate = {
        tier: 1,
        txNeeded: Math.max(0, TIER_GATES[1].minTx - transactionCount),
        revenueNeeded: Math.max(0, TIER_GATES[1].minRevenue - totalRevenue),
      };
    } else if (currentTier === 1) {
      // Moving to Tier 2
      nextGate = {
        tier: 2,
        txNeeded: Math.max(0, TIER_GATES[2].minTx - transactionCount),
        revenueNeeded: Math.max(0, TIER_GATES[2].minRevenue - totalRevenue),
      };
    } else if (currentTier === 2) {
      // Moving to Tier 3 (requires PRO)
      nextGate = {
        tier: 3,
        txNeeded: Math.max(0, TIER_GATES[3].minTx - transactionCount),
        revenueNeeded: Math.max(0, TIER_GATES[3].minRevenue - totalRevenue),
      };
    }

    const response: PosTierStatus = {
      tier: currentTier,
      transactionCount,
      totalRevenue: Math.round(totalRevenue * 100) / 100, // Round to 2 decimals
    };

    if (nextGate) {
      response.nextGate = nextGate;
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching organizer POS tier status:', error);
    res.status(500).json({ message: 'Failed to fetch organizer POS tier status' });
  }
};
