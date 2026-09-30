import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import {
  createCrew,
  getCrew,
  getCrewLeaderboard,
  joinCrew,
  removeMember,
  getCrewFeed,
  listCrews,
  getMyCrews,
  leaveCrew,
  transferFounder,
  disbandCrew,
  getMyInvasionDiscount,
} from '../controllers/crewController';

const router = Router();

// Static paths first so '/mine' is never captured by '/:crewId'.
router.get('/', optionalAuthenticate, listCrews);
router.get('/mine', authenticate, getMyCrews);
router.get('/invasion/active', authenticate, getMyInvasionDiscount); // Feature #397: static path, must stay above '/:crewId'
router.post('/', authenticate, createCrew);
router.get('/:crewId', optionalAuthenticate, getCrew);
router.get('/:crewId/leaderboard', optionalAuthenticate, getCrewLeaderboard);
router.post('/:crewId/join', authenticate, joinCrew);
router.post('/:crewId/leave', authenticate, leaveCrew);
router.post('/:crewId/transfer', authenticate, transferFounder);
router.post('/:crewId/disband', authenticate, disbandCrew);
router.post('/:crewId/members/:userId/remove', authenticate, removeMember);
router.get('/:crewId/feed', optionalAuthenticate, getCrewFeed);

export default router;
