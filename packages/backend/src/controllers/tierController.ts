import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  getTierBenefits,
  getTierProgress,
  syncOrganizerTier,
} from '../services/tierService';

/**
 * GET /api/tiers/mine
 * Returns current organizer's tier, benefits, and progress to next tier
 */
export const getMyTier = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get organizer by user ID
    const organizer = await prisma.organizer.findUnique({
      where: { userId },
    });

    if (!organizer) {
      return res.status(404).json({ error: 'Organizer profile not found' });
    }

    // Get tier benefits and progress
    const benefits = getTierBenefits(organizer.tier as any);
    const progress = await getTierProgress(organizer.id);

    res.json({
      tier: organizer.tier,
      benefits,
      progress,
      tierUpdatedAt: organizer.tierUpdatedAt,
    });
  } catch (error) {
    console.error('Error fetching organizer tier:', error);
    res.status(500).json({ error: 'Failed to fetch organizer tier' });
  }
};

/**
 * GET /api/tiers/organizer/:organizerId
 * Returns public tier info for a given organizer (no auth required)
 */
export const getOrganizerPublicTier = async (req: any, res: Response) => {
  try {
    const { organizerId } = req.params;

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: {
        id: true,
        tier: true,
        tierUpdatedAt: true,
      },
    });

    if (!organizer) {
      return res.status(404).json({ error: 'Organizer not found' });
    }

    const benefits = getTierBenefits(organizer.tier as any);

    res.json({
      organizerId: organizer.id,
      tier: organizer.tier,
      label: benefits.label,
      perks: benefits.perks,
      tierUpdatedAt: organizer.tierUpdatedAt,
    });
  } catch (error) {
    console.error('Error fetching organizer public tier:', error);
    res.status(500).json({ error: 'Failed to fetch organizer tier' });
  }
};

/**
 * POST /api/tiers/sync/:organizerId (internal/admin use)
 * Recalculates and syncs tier for a specific organizer
 */
export const syncTierForOrganizer = async (req: AuthRequest, res: Response) => {
  try {
    const { organizerId } = req.params;

    // Admin-only endpoint: requireAdmin middleware enforced in routes/tiers.ts
    await syncOrganizerTier(organizerId);

    const organizer = await prisma.organizer.findUnique({
      where: { id: organizerId },
      select: { id: true, tier: true, tierUpdatedAt: true },
    });

    res.json({ message: 'Tier synced', organizer });
  } catch (error) {
    console.error('Error syncing organizer tier:', error);
    res.status(500).json({ error: 'Failed to sync organizer tier' });
  }
};
