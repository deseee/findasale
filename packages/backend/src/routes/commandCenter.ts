import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { getCommandCenter } from '../controllers/commandCenterController';

const router = Router();

// GET /api/organizer/command-center
// Multi-sale overview for PRO/TEAMS tier organizers
router.get('/', authenticate, requireTier('PRO'), getCommandCenter);

export default router;
