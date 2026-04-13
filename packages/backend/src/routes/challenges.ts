import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getAllChallengesHandler,
  getActiveChallengesHandler,
  getMyChallengeProgressHandler,
  getLeaderboardHandler,
} from '../controllers/challengeController';

const router = Router();

/**
 * GET /api/challenges
 * Returns all challenges (past, current, upcoming)
 */
router.get('/', getAllChallengesHandler);

/**
 * GET /api/challenges/active
 * Returns currently active challenges with full objective details
 */
router.get('/active', getActiveChallengesHandler);

/**
 * GET /api/challenges/my-progress
 * Returns authenticated user's progress on all active challenges
 */
router.get('/my-progress', authenticate, getMyChallengeProgressHandler);

/**
 * GET /api/challenges/:challengeId/leaderboard
 * Returns top 10 users by completed objectives for a specific challenge
 */
router.get('/:challengeId/leaderboard', getLeaderboardHandler);

export default router;
