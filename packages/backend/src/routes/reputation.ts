import { Router } from 'express';
import { getOrganizerReputation, getSimpleReputation, recalculateReputation } from '../controllers/reputationController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Public endpoint — get organizer reputation score and breakdown (detailed)
router.get('/:id/reputation', getOrganizerReputation);

// Feature #71: Public endpoint — get simplified organizer reputation score (0–5 stars)
router.get('/:id/reputation/simple', getSimpleReputation);

// Feature #71: Auth required — recalculate reputation for organizer (self only)
router.post('/:id/reputation/recalculate', authenticate, recalculateReputation);

export default router;
