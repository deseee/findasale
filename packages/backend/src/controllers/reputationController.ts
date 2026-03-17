import { Response } from 'express';
import { computeReputationScore } from '../services/reputationService';

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
    res.status(500).json({ error: 'Failed to fetch organizer reputation' });
  }
};
