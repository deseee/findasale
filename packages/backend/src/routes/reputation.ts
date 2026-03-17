import { Router } from 'express';
import { getOrganizerReputation } from '../controllers/reputationController';

const router = Router();

// Public endpoint — get organizer reputation score and breakdown
router.get('/organizers/:id/reputation', getOrganizerReputation);

export default router;
