import { Response } from 'express';
import { computeReputationScore, getOrUpdateOrganizerReputation, calculateOrganizerReputationScore } from '../services/reputationService';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

/**
 * GET /api/organizers/:id/reputation
 * Public endpoint — no auth required
 * Returns reputation score, breakdown, and badge for the given organizer
 */
export const getOrganizerReputation = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const reputation = await computeReputationScore(id);

    res.json(reputation);
  } catch (error) {
    console.error('Error fetching organizer reputation:', error);
    res.status(500).json({ message: 'Failed to fetch organizer reputation' });
  }
};

/**
 * Feature #71: GET /api/organizers/:id/reputation/simple
 * Public endpoint — no auth required
 * Returns simplified OrganizerReputation score (0–5 stars) and isNew badge
 * Cached; recalculates if > 24h old
 */
export const getSimpleReputation = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    // Validate organizer exists
    const organizer = await prisma.organizer.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    // Get or update reputation
    const reputation = await getOrUpdateOrganizerReputation(id);

    if (!reputation) {
      // First time — return defaults
      return res.json({
        score: 0,
        isNew: true,
        responseTimeAvg: 0,
        saleCount: 0,
        photoQualityAvg: 0,
      });
    }

    res.json({
      score: reputation.score,
      isNew: reputation.isNew,
      responseTimeAvg: reputation.responseTimeAvg,
      saleCount: reputation.saleCount,
      photoQualityAvg: reputation.photoQualityAvg,
    });
  } catch (error) {
    console.error('Error fetching simple reputation:', error);
    res.status(500).json({ message: 'Failed to fetch organizer reputation' });
  }
};

/**
 * Feature #71: POST /api/organizers/:id/reputation/recalculate
 * Auth required — organizer can only recalculate their own reputation
 * Forces immediate recalculation (ignores 24h cache)
 */
export const recalculateReputation = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Validate organizer exists and user owns it
    const organizer = await prisma.organizer.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!organizer) {
      return res.status(404).json({ message: 'Organizer not found' });
    }

    if (organizer.userId !== userId) {
      return res.status(403).json({ message: 'Not authorized to recalculate this organizer\'s reputation' });
    }

    // Recalculate
    await calculateOrganizerReputationScore(id);

    // Fetch updated record
    const reputation = await prisma.organizerReputation.findUnique({
      where: { organizerId: userId! },
    });

    res.json({
      message: 'Reputation recalculated',
      reputation: {
        score: reputation?.score,
        isNew: reputation?.isNew,
        saleCount: reputation?.saleCount,
        photoQualityAvg: reputation?.photoQualityAvg,
      },
    });
  } catch (error) {
    console.error('Error recalculating reputation:', error);
    res.status(500).json({ message: 'Failed to recalculate reputation' });
  }
};
