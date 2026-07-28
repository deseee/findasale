import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireTier } from '../middleware/requireTier';
import {
  discoverHubs,
  getHub,
  createHub,
  updateHub,
  deleteHub,
  listMyHubs,
  getMyHub,
  setHubEvent,
} from '../controllers/hubController';

const router = Router();

// Public endpoints
router.get('/api/hubs', discoverHubs);
router.get('/api/hubs/:slug', getHub);

// Authenticated endpoints (organizer)
router.get('/api/organizer/hubs', authenticate, listMyHubs);
router.get('/api/organizer/hubs/:hubId', authenticate, getMyHub);
router.post('/api/organizer/hubs', authenticate, requireTier('PRO'), createHub);
router.put('/api/organizer/hubs/:hubId', authenticate, requireTier('PRO'), updateHub);
router.delete('/api/organizer/hubs/:hubId', authenticate, requireTier('PRO'), deleteHub);
router.patch('/api/organizer/hubs/:hubId/event', authenticate, requireTier('PRO'), setHubEvent);

export default router;
