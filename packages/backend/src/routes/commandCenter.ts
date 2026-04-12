import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import { getCommandCenter } from '../controllers/commandCenterController';
import { getActivityFeed } from '../controllers/organizerActivityFeedController';

const router = Router();

// GET /api/organizer/command-center
// Multi-sale overview for TEAMS tier organizers
router.get('/', authenticate, requireTier('TEAMS'), getCommandCenter);

// GET /api/organizer/activity-feed
// Recent activity across organizer's sales (favorites, purchases, RSVPs, messages, etc.)
router.get('/activity-feed', authenticate, getActivityFeed);

export default router;
