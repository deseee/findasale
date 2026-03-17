import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  getActiveChallenges,
  getAllChallenges,
  getMyChallengeProgress,
  getLeaderboard,
} from '../services/challengeService';

/**
 * GET /api/challenges
 * Public endpoint — returns all challenges (past, current, upcoming)
 */
export const getAllChallengesHandler = async (req: any, res: Response) => {
  try {
    const challenges = getAllChallenges();
    const now = new Date();

    const result = challenges.map(c => ({
      id: c.id,
      name: c.name,
      theme: c.theme,
      description: c.description,
      emoji: c.emoji,
      startDate: c.startDate,
      endDate: c.endDate,
      badgeColor: c.badgeColor,
      isActive: now >= c.startDate && now <= c.endDate,
      daysRemaining: Math.max(0, Math.ceil((c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
      objectiveCount: c.objectives.length,
    }));

    res.json(result);
  } catch (error) {
    console.error('Failed to fetch all challenges:', error);
    res.status(500).json({ message: 'Server error while fetching challenges' });
  }
};

/**
 * GET /api/challenges/active
 * Public endpoint — returns currently active challenges
 */
export const getActiveChallengesHandler = async (req: any, res: Response) => {
  try {
    const challenges = getActiveChallenges();
    const now = new Date();

    const result = challenges.map(c => ({
      id: c.id,
      name: c.name,
      theme: c.theme,
      description: c.description,
      emoji: c.emoji,
      startDate: c.startDate,
      endDate: c.endDate,
      badgeColor: c.badgeColor,
      daysRemaining: Math.max(0, Math.ceil((c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))),
      objectives: c.objectives.map(o => ({
        id: o.id,
        description: o.description,
        type: o.type,
        target: o.target,
        targetValue: o.targetValue,
      })),
    }));

    res.json(result);
  } catch (error) {
    console.error('Failed to fetch active challenges:', error);
    res.status(500).json({ message: 'Server error while fetching active challenges' });
  }
};

/**
 * GET /api/challenges/my-progress
 * Authenticated endpoint — returns user's progress on all active challenges
 */
export const getMyChallengeProgressHandler = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const progress = await getMyChallengeProgress(req.user.id);
    res.json(progress);
  } catch (error) {
    console.error('Failed to fetch user challenge progress:', error);
    res.status(500).json({ message: 'Server error while fetching your progress' });
  }
};

/**
 * GET /api/challenges/:challengeId/leaderboard
 * Public endpoint — returns top 10 users for a specific challenge
 */
export const getLeaderboardHandler = async (req: any, res: Response) => {
  try {
    const { challengeId } = req.params;

    if (!challengeId) {
      return res.status(400).json({ message: 'challengeId is required' });
    }

    const leaderboard = await getLeaderboard(challengeId);
    res.json(leaderboard);
  } catch (error) {
    console.error('Failed to fetch leaderboard:', error);
    res.status(500).json({ message: 'Server error while fetching leaderboard' });
  }
};
