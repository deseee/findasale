// Phase 23: Referral program — dashboard stats endpoint

import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

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
