import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createCrew,
  getCrew,
  getCrewLeaderboard,
  joinCrew,
  removeMember,
  getCrewFeed,
} from '../controllers/crewController';

const router = Router();

router.post('/', authenticate, createCrew);
router.get('/:crewId', getCrew);
router.get('/:crewId/leaderboard', getCrewLeaderboard);
router.post('/:crewId/join', authenticate, joinCrew);
router.post('/:crewId/members/:userId/remove', authenticate, removeMember);
router.get('/:crewId/feed', getCrewFeed);

export default router;
